import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const basePath = process.env.VITE_BASE_PATH ?? '/'

// https://vite.dev/config/
export default defineConfig({
  base: basePath,
  root: projectRoot,
  plugins: [react(), basicSsl()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('react-dom')) {
            return 'react'
          }

          if (
            id.includes('@creit.tech/stellar-wallets-kit') ||
            id.includes('@stellar/freighter-api')
          ) {
            return 'wallet'
          }

          if (id.includes('@stellar/stellar-sdk/contract')) {
            return 'soroban-contract'
          }

          if (id.includes('@stellar/stellar-sdk/rpc')) {
            return 'soroban-rpc'
          }

          if (
            id.includes('@stellar/stellar-sdk') ||
            id.includes('/buffer/') ||
            id.includes('\\buffer\\')
          ) {
            return 'stellar-core'
          }

          return undefined
        },
      },
    },
  },
  resolve: {
    alias: {
      '@contract-client': fileURLToPath(
        new URL('./packages/live-poll-contract/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    host: 'localhost',
    https: true,
    port: 5173,
  },
  preview: {
    host: 'localhost',
    https: true,
    port: 4173,
  },
})
