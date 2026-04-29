import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import net from 'node:net'

const [htmlArg, framesArg] = process.argv.slice(2)

if (!htmlArg || !framesArg) {
  console.error('Usage: node capture-demo-frames.mjs <htmlPath> <framesDir>')
  process.exit(1)
}

const htmlPath = resolve(htmlArg)
const framesDir = resolve(framesArg)
const browserCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]

const browserPath = browserCandidates.find((candidate) => existsSync(candidate))

if (!browserPath) {
  console.error('Could not find Chrome or Edge for DevTools capture.')
  process.exit(1)
}

try {
  await captureFrames(browserPath)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

async function captureFrames(browserPathResolved) {
  rmSync(framesDir, { force: true, recursive: true })
  mkdirSync(framesDir, { recursive: true })

  const profileDir = join(framesDir, '.profile')
  mkdirSync(profileDir, { recursive: true })

  const port = await findFreePort()
  const pageUrl = pathToFileUrl(htmlPath)
  const budgets = [0, 1000, 2000, 3000, 4200, 5400, 6600, 7800]
  const browser = spawn(
    browserPathResolved,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-crash-reporter',
      '--no-first-run',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
    ],
    {
      stdio: 'ignore',
      windowsHide: true,
    },
  )

  let pageSocket = null

  try {
    await waitForDebugger(port)
    const target = await createPageTarget(port, pageUrl)
    pageSocket = await connectWebSocket(target.webSocketDebuggerUrl)

    const cdp = createCdpClient(pageSocket)

    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false,
    })

    const loaded = cdp.waitFor('Page.loadEventFired')
    await cdp.send('Page.navigate', { url: pageUrl })
    await loaded
    await delay(300)

    let elapsed = 0

    for (let index = 0; index < budgets.length; index += 1) {
      const waitMs = budgets[index] - elapsed

      if (waitMs > 0) {
        await delay(waitMs)
      }

      elapsed = budgets[index]

      const { data } = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      })

      writeFileSync(join(framesDir, `frame-${String(index).padStart(2, '0')}.png`), data, 'base64')
    }
  } finally {
    if (pageSocket) {
      pageSocket.close()
    }

    browser.kill('SIGKILL')
    await delay(300)
    rmSync(profileDir, { force: true, recursive: true })
  }
}

function pathToFileUrl(filePath) {
  const normalized = filePath.replace(/\\/g, '/')
  return `file:///${normalized}`
}

async function findFreePort() {
  return await new Promise((resolvePort, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()

      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not allocate a debugging port.')))
        return
      }

      server.close(() => resolvePort(address.port))
    })
  })
}

async function waitForDebugger(port) {
  let lastError = null

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)

      if (response.ok) {
        return
      }
    } catch (error) {
      lastError = error
    }

    await delay(250)
  }

  throw lastError ?? new Error('Timed out waiting for the headless browser debugger endpoint.')
}

async function createPageTarget(port, pageUrl) {
  const response = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(pageUrl)}`,
    { method: 'PUT' },
  )

  if (!response.ok) {
    throw new Error(`Could not create a DevTools page target. HTTP ${response.status}`)
  }

  return await response.json()
}

async function connectWebSocket(webSocketDebuggerUrl) {
  return await new Promise((resolveSocket, reject) => {
    const socket = new WebSocket(webSocketDebuggerUrl)

    socket.addEventListener('open', () => resolveSocket(socket), { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
}

function createCdpClient(socket) {
  let nextId = 0
  const pending = new Map()
  const listeners = new Map()

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)

    if (message.id) {
      const resolver = pending.get(message.id)

      if (!resolver) {
        return
      }

      pending.delete(message.id)

      if (message.error) {
        resolver.reject(new Error(message.error.message))
        return
      }

      resolver.resolve(message.result)
      return
    }

    const callbacks = listeners.get(message.method)

    if (!callbacks?.length) {
      return
    }

    listeners.set(
      message.method,
      callbacks.filter((callback) => !callback(message.params)),
    )
  })

  return {
    send(method, params = {}) {
      const id = ++nextId

      return new Promise((resolveMessage, rejectMessage) => {
        pending.set(id, { resolve: resolveMessage, reject: rejectMessage })
        socket.send(JSON.stringify({ id, method, params }))
      })
    },
    waitFor(method) {
      return new Promise((resolveEvent) => {
        const callbacks = listeners.get(method) ?? []
        callbacks.push((params) => {
          resolveEvent(params)
          return true
        })
        listeners.set(method, callbacks)
      })
    },
  }
}
