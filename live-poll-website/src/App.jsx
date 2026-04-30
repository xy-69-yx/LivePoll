import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  POLL_CONTRACT_ID,
  POLL_NETWORK_PASSPHRASE,
  POLL_OPTIONS,
  POLL_RPC_URL,
  buildExplorerTransactionUrl,
  createEventServer,
  createReadClient,
  createSigningClient,
  parsePollEvent,
  pollEventsFilters,
} from './lib/pollClient'
import { KitEventType, StellarWalletsKit, initWalletKit } from './lib/walletKit'
import './App.css'

const defaultCounts = Object.fromEntries(
  POLL_OPTIONS.map(({ symbol }) => [symbol, 0]),
)

const formatContractPreview = (value) =>
  value ? `${value.slice(0, 12)}...${value.slice(-8)}` : 'Unavailable'

const contractIdPreview = formatContractPreview(POLL_CONTRACT_ID)
const WALLET_DISCONNECT_STORAGE_KEY = 'live-poll-wallet-manual-disconnect'
const VOTE_CACHE_STORAGE_KEY = 'live-poll-vote-cache'

const createIdleTransactionState = () => ({
  phase: 'idle',
  option: '',
  txHash: '',
  message: 'No vote submitted yet.',
})

const createInitialContractMode = () => ({
  status: 'checking',
  rewardRate: 0,
  rewardContract: '',
  message: 'Inspecting the deployed contract for reward and inter-contract support...',
})

const createEmptyWalletInsights = () => ({
  rewardBalance: 0,
  voterVotes: 0,
  lastSyncedAt: '',
})

const normalizeVoteCounts = (counts) =>
  Object.fromEntries(
    POLL_OPTIONS.map(({ symbol }) => [symbol, Number(counts?.[symbol] ?? 0)]),
  )

const readVoteCache = () => {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const rawCache = window.localStorage.getItem(VOTE_CACHE_STORAGE_KEY)

    if (!rawCache) {
      return null
    }

    const parsedCache = JSON.parse(rawCache)

    return {
      counts: normalizeVoteCounts(parsedCache.counts),
      lastUpdatedAt:
        typeof parsedCache.lastUpdatedAt === 'string'
          ? parsedCache.lastUpdatedAt
          : '',
    }
  } catch {
    return null
  }
}

const writeVoteCache = (counts, lastUpdatedAt) => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(
    VOTE_CACHE_STORAGE_KEY,
    JSON.stringify({
      counts: normalizeVoteCounts(counts),
      lastUpdatedAt,
    }),
  )
}

const initialVoteCache = readVoteCache()

const readManualDisconnectPreference = () => {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(WALLET_DISCONNECT_STORAGE_KEY) === 'true'
}

const writeManualDisconnectPreference = (shouldStayDisconnected) => {
  if (typeof window === 'undefined') {
    return
  }

  if (shouldStayDisconnected) {
    window.localStorage.setItem(WALLET_DISCONNECT_STORAGE_KEY, 'true')
    return
  }

  window.localStorage.removeItem(WALLET_DISCONNECT_STORAGE_KEY)
}

const formatAddress = (address) =>
  address?.length > 12 ? `${address.slice(0, 6)}...${address.slice(-6)}` : address

const formatRefreshTimestamp = (date = new Date()) =>
  date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })

const formatEventTimestamp = (value) => {
  const date = value ? new Date(value) : new Date()

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return formatRefreshTimestamp(date)
}

const formatError = (error) => {
  if (!error) {
    return 'Something went wrong.'
  }

  if (typeof error === 'string') {
    return error
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Something went wrong.'
}

const formatNetworkName = (passphrase) => {
  if (!passphrase) {
    return 'Unknown network'
  }

  if (passphrase === POLL_NETWORK_PASSPHRASE) {
    return 'Stellar Testnet'
  }

  if (passphrase === 'Public Global Stellar Network ; September 2015') {
    return 'Stellar Public'
  }

  return passphrase
}

const getOptionLabel = (option) =>
  POLL_OPTIONS.find(({ symbol }) => symbol === option)?.label ?? option

const classifyError = (error) => {
  const message = formatError(error)
  const lowerMessage = message.toLowerCase()
  const lowerName = error?.constructor?.name?.toLowerCase?.() ?? ''

  if (
    lowerName.includes('userrejected') ||
    lowerMessage.includes('rejected') ||
    lowerMessage.includes('denied') ||
    lowerMessage.includes('declined') ||
    lowerMessage.includes('cancelled') ||
    lowerMessage.includes('canceled')
  ) {
    return {
      kind: 'user-rejected',
      message: 'The wallet request was rejected, so the transaction was not signed.',
    }
  }

  if (
    lowerMessage.includes('underfunded') ||
    lowerMessage.includes('insufficient balance') ||
    lowerMessage.includes('insufficient fee') ||
    (lowerMessage.includes('insufficient') && lowerMessage.includes('balance'))
  ) {
    return {
      kind: 'insufficient-balance',
      message: 'This wallet does not have enough Testnet XLM to pay the transaction fee.',
    }
  }

  if (
    lowerName.includes('nosigner') ||
    lowerMessage.includes('not available') ||
    lowerMessage.includes('wallet not found') ||
    lowerMessage.includes('install or unlock') ||
    lowerMessage.includes('install') ||
    lowerMessage.includes('unlock')
  ) {
    return {
      kind: 'wallet-not-found',
      message: 'No supported wallet is ready in this browser. Install or unlock one, then try again.',
    }
  }

  return {
    kind: 'unknown',
    message,
  }
}

const walletToneByState = {
  ready: 'success',
  warning: 'warning',
  empty: 'danger',
  idle: 'muted',
}

const syncToneByState = {
  starting: 'muted',
  live: 'success',
  error: 'danger',
}

const transactionToneByPhase = {
  idle: 'muted',
  pending: 'warning',
  success: 'success',
  failed: 'danger',
}

const buildActivityEntry = (event) => {
  if (event.type === 'vote') {
    return {
      key: `vote:${event.txHash || event.ledger}:${event.option}`,
      title: `${getOptionLabel(event.option)} reached ${event.votes} votes`,
      detail: 'Vote totals updated from the Soroban event stream.',
      badge: `${event.votes} total`,
      ledger: event.ledger,
      txHash: event.txHash,
      timestamp: formatEventTimestamp(event.ledgerClosedAt),
    }
  }

  return {
    key: `reward:${event.txHash || event.ledger}:${event.option}`,
    title: `${event.amount} reward points issued`,
    detail: `${getOptionLabel(event.option)} triggered an inter-contract reward mint. Latest balance snapshot: ${event.balance}.`,
    badge: `Balance ${event.balance}`,
    ledger: event.ledger,
    txHash: event.txHash,
    timestamp: formatEventTimestamp(event.ledgerClosedAt),
  }
}

function App() {
  const [counts, setCounts] = useState(() => initialVoteCache?.counts ?? defaultCounts)
  const [isLoadingVotes, setIsLoadingVotes] = useState(() => !initialVoteCache)
  const [isRefreshingVotes, setIsRefreshingVotes] = useState(false)
  const [refreshError, setRefreshError] = useState('')
  const [walletError, setWalletError] = useState('')
  const [voteError, setVoteError] = useState('')
  const [insightsError, setInsightsError] = useState('')
  const [walletAddress, setWalletAddress] = useState('')
  const [walletNetwork, setWalletNetwork] = useState('')
  const [walletPassphrase, setWalletPassphrase] = useState('')
  const [supportedWallets, setSupportedWallets] = useState([])
  const [isLoadingWallets, setIsLoadingWallets] = useState(true)
  const [selectedWalletId, setSelectedWalletId] = useState('')
  const [isConnectingWalletId, setIsConnectingWalletId] = useState('')
  const [lastUpdatedAt, setLastUpdatedAt] = useState(
    () => initialVoteCache?.lastUpdatedAt ?? '',
  )
  const [copiedContract, setCopiedContract] = useState(false)
  const [lastReceipt, setLastReceipt] = useState(null)
  const [lastVoteEvent, setLastVoteEvent] = useState(null)
  const [lastRewardEvent, setLastRewardEvent] = useState(null)
  const [activityFeed, setActivityFeed] = useState([])
  const [transactionState, setTransactionState] = useState(
    createIdleTransactionState(),
  )
  const [contractMode, setContractMode] = useState(createInitialContractMode)
  const [walletInsights, setWalletInsights] = useState(createEmptyWalletInsights)
  const [syncState, setSyncState] = useState({
    status: 'starting',
    message: 'Connecting to Soroban events...',
  })
  const [pageHealth, setPageHealth] = useState(() => ({
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    visibility:
      typeof document === 'undefined' ? 'visible' : document.visibilityState,
  }))
  const shouldStayDisconnectedRef = useRef(readManualDisconnectPreference())
  const latestVoteRequestIdRef = useRef(0)
  const deferredActivityFeed = useDeferredValue(activityFeed)

  const isWalletConnected = Boolean(walletAddress)
  const isOnTestnet = walletPassphrase === POLL_NETWORK_PASSPHRASE

  const selectedWallet = useMemo(
    () => supportedWallets.find(({ id }) => id === selectedWalletId) ?? null,
    [selectedWalletId, supportedWallets],
  )

  const availableWallets = useMemo(
    () => supportedWallets.filter(({ isAvailable }) => isAvailable),
    [supportedWallets],
  )

  const availableWalletCount = useMemo(
    () => availableWallets.length,
    [availableWallets],
  )

  const totalVotes = useMemo(
    () =>
      POLL_OPTIONS.reduce(
        (sum, { symbol }) => sum + (counts[symbol] ?? 0),
        0,
      ),
    [counts],
  )

  const leadingOption = useMemo(() => {
    if (!totalVotes) {
      return 'No votes yet'
    }

    const highestVoteCount = Math.max(
      ...POLL_OPTIONS.map(({ symbol }) => counts[symbol] ?? 0),
    )
    const leaders = POLL_OPTIONS.filter(
      ({ symbol }) => (counts[symbol] ?? 0) === highestVoteCount,
    )

    if (leaders.length !== 1) {
      return 'Draw'
    }

    return leaders[0].label
  }, [counts, totalVotes])

  const walletState = (() => {
    if (isConnectingWalletId) {
      return {
        label: 'Connecting wallet',
        tone: walletToneByState.idle,
      }
    }

    if (!availableWalletCount && !isLoadingWallets) {
      return {
        label: 'No wallet detected',
        tone: walletToneByState.empty,
      }
    }

    if (!isWalletConnected) {
      return {
        label: 'Choose a wallet',
        tone: walletToneByState.idle,
      }
    }

    if (!isOnTestnet) {
      return {
        label: 'Switch wallet to Testnet',
        tone: walletToneByState.warning,
      }
    }

    return {
      label: 'Ready to vote',
      tone: walletToneByState.ready,
    }
  })()

  const contractState = (() => {
    if (contractMode.status === 'advanced') {
      return {
        label: 'Advanced rewards live',
        tone: 'success',
      }
    }

    if (contractMode.status === 'checking') {
      return {
        label: 'Checking contract mode',
        tone: 'muted',
      }
    }

    return {
      label: 'Legacy deployment',
      tone: 'warning',
    }
  })()

  const transactionTone =
    transactionToneByPhase[transactionState.phase] ?? 'muted'

  const syncTone = syncToneByState[syncState.status] ?? 'muted'

  const rewardMetricValue =
    contractMode.status === 'advanced'
      ? `${contractMode.rewardRate} pts`
      : contractMode.status === 'checking'
        ? 'Checking'
        : 'Pending'

  const cadenceLabel = !pageHealth.online
    ? 'Waiting for reconnect'
    : pageHealth.visibility === 'hidden'
      ? '10s background sync'
      : '3s active sync'

  const clearWalletConnectionState = useCallback(() => {
    setWalletAddress('')
    setWalletPassphrase('')
    setWalletNetwork('')
  }, [])

  useEffect(() => {
    if (!lastUpdatedAt) {
      return
    }

    writeVoteCache(counts, lastUpdatedAt)
  }, [counts, lastUpdatedAt])

  const pushActivityEntry = useCallback((entry) => {
    if (!entry) {
      return
    }

    startTransition(() => {
      setActivityFeed((currentFeed) => {
        const nextFeed = [
          entry,
          ...currentFeed.filter((currentEntry) => currentEntry.key !== entry.key),
        ]

        return nextFeed.slice(0, 6)
      })
    })
  }, [])

  const loadVotes = useCallback(async ({ silent = false } = {}) => {
    const requestId = latestVoteRequestIdRef.current + 1
    latestVoteRequestIdRef.current = requestId

    if (silent) {
      setIsRefreshingVotes(true)
    } else {
      setIsLoadingVotes(true)
    }

    setRefreshError('')

    try {
      const readClient = createReadClient()
      const results = await Promise.all(
        POLL_OPTIONS.map(({ symbol }) =>
          readClient.get_votes({
            option: symbol,
          }),
        ),
      )

      if (latestVoteRequestIdRef.current !== requestId) {
        return
      }

      startTransition(() => {
        setCounts(
          Object.fromEntries(
            POLL_OPTIONS.map((option, index) => [
              option.symbol,
              Number(results[index].result ?? 0),
            ]),
          ),
        )
        setLastUpdatedAt(formatRefreshTimestamp())
      })
    } catch (error) {
      if (latestVoteRequestIdRef.current !== requestId) {
        return
      }

      setRefreshError(formatError(error))
    } finally {
      if (latestVoteRequestIdRef.current === requestId) {
        setIsLoadingVotes(false)
        setIsRefreshingVotes(false)
      }
    }
  }, [])

  const loadContractMode = useCallback(async () => {
    try {
      const readClient = createReadClient()
      const [rateResult, rewardContractResult] = await Promise.all([
        readClient.get_reward_rate(),
        readClient.get_reward_contract(),
      ])

      setContractMode({
        status: 'advanced',
        rewardRate: Number(rateResult.result ?? 0),
        rewardContract: String(rewardContractResult.result ?? ''),
        message:
          'Advanced reward contract detected. Wallet rewards and inter-contract minting are active.',
      })
    } catch {
      setContractMode((currentMode) => {
        if (currentMode.status === 'advanced') {
          return {
            ...currentMode,
            message:
              'Reward contract probe could not refresh, so the last advanced profile is being kept.',
          }
        }

        return {
          status: 'legacy',
          rewardRate: 0,
          rewardContract: '',
          message:
            'Legacy poll deployment detected. The upgraded reward contract activates after redeploying the new contract pair.',
        }
      })
    }
  }, [])

  const loadWalletInsights = useCallback(
    async (targetWallet = walletAddress) => {
      if (!targetWallet || contractMode.status !== 'advanced') {
        setWalletInsights(createEmptyWalletInsights())
        setInsightsError('')
        return
      }

      setInsightsError('')

      try {
        const readClient = createReadClient()
        const [rewardBalanceResult, voterVotesResult] = await Promise.all([
          readClient.get_reward_balance({
            voter: targetWallet,
          }),
          readClient.get_voter_votes({
            voter: targetWallet,
          }),
        ])

        startTransition(() => {
          setWalletInsights({
            rewardBalance: Number(rewardBalanceResult.result ?? 0),
            voterVotes: Number(voterVotesResult.result ?? 0),
            lastSyncedAt: formatRefreshTimestamp(),
          })
        })
      } catch (error) {
        setInsightsError(formatError(error))
      }
    },
    [contractMode.status, walletAddress],
  )

  const refreshWallets = useCallback(async () => {
    setIsLoadingWallets(true)
    setWalletError('')

    try {
      initWalletKit()
      const wallets = await StellarWalletsKit.refreshSupportedWallets()
      setSupportedWallets(wallets)
      setSelectedWalletId((currentWalletId) => {
        if (wallets.some(({ id }) => id === currentWalletId)) {
          return currentWalletId
        }

        return wallets.find(({ isAvailable }) => isAvailable)?.id ?? wallets[0]?.id ?? ''
      })
    } catch (error) {
      setWalletError(formatError(error))
    } finally {
      setIsLoadingWallets(false)
    }
  }, [])

  const applyParsedPollEvent = useCallback(
    (parsedEvent) => {
      if (!parsedEvent) {
        return
      }

      pushActivityEntry(buildActivityEntry(parsedEvent))

      if (parsedEvent.type === 'vote' && parsedEvent.option in defaultCounts) {
        startTransition(() => {
          setCounts((currentCounts) => {
            if ((currentCounts[parsedEvent.option] ?? 0) === parsedEvent.votes) {
              return currentCounts
            }

            return {
              ...currentCounts,
              [parsedEvent.option]: parsedEvent.votes,
            }
          })
          setLastUpdatedAt(
            formatRefreshTimestamp(
              new Date(parsedEvent.ledgerClosedAt || Date.now()),
            ),
          )
          setLastVoteEvent(parsedEvent)
        })
      }

      if (parsedEvent.type === 'reward') {
        startTransition(() => {
          setLastRewardEvent(parsedEvent)
        })

        if (
          contractMode.status === 'advanced' &&
          walletAddress &&
          transactionState.txHash &&
          parsedEvent.txHash === transactionState.txHash
        ) {
          void loadWalletInsights(walletAddress)
        }
      }
    },
    [
      contractMode.status,
      loadWalletInsights,
      pushActivityEntry,
      transactionState.txHash,
      walletAddress,
    ],
  )

  const connectWallet = useCallback(async (wallet) => {
    setVoteError('')
    setWalletError('')

    if (!wallet) {
      setWalletError('Choose a wallet option first.')
      return null
    }

    if (!wallet.isAvailable) {
      setWalletError(
        `${wallet.name} is not available in this browser. Install or unlock it first.`,
      )
      return null
    }

    setIsConnectingWalletId(wallet.id)

    try {
      initWalletKit()
      StellarWalletsKit.setWallet(wallet.id)

      const { address } = await StellarWalletsKit.fetchAddress()
      const networkDetails = await StellarWalletsKit.getNetwork()
      const networkPassphrase = networkDetails.networkPassphrase || ''
      const networkName =
        networkDetails.network || formatNetworkName(networkPassphrase)

      shouldStayDisconnectedRef.current = false
      writeManualDisconnectPreference(false)
      setSelectedWalletId(wallet.id)
      setWalletAddress(address)
      setWalletPassphrase(networkPassphrase)
      setWalletNetwork(networkName)

      return {
        address,
        networkPassphrase,
        networkName,
      }
    } catch (error) {
      setWalletError(classifyError(error).message)
      return null
    } finally {
      setIsConnectingWalletId('')
    }
  }, [])

  const disconnectWallet = useCallback(async () => {
    setVoteError('')
    setWalletError('')
    setInsightsError('')

    try {
      shouldStayDisconnectedRef.current = true
      writeManualDisconnectPreference(true)
      await StellarWalletsKit.disconnect()
      clearWalletConnectionState()
      setWalletInsights(createEmptyWalletInsights())
    } catch (error) {
      shouldStayDisconnectedRef.current = false
      writeManualDisconnectPreference(false)
      setWalletError(formatError(error))
    }
  }, [clearWalletConnectionState])

  const handleVote = useCallback(
    async (option) => {
      setVoteError('')
      setWalletError('')

      let activeAddress = walletAddress
      let activePassphrase = walletPassphrase

      if (!activeAddress) {
        if (!selectedWallet) {
          setVoteError('Choose a wallet option before you vote.')
          return
        }

        const connection = await connectWallet(selectedWallet)

        if (!connection) {
          return
        }

        activeAddress = connection.address
        activePassphrase = connection.networkPassphrase
      }

      if (activePassphrase !== POLL_NETWORK_PASSPHRASE) {
        setVoteError(
          `Switch ${selectedWallet?.name ?? 'your wallet'} to Testnet before you submit a vote.`,
        )
        return
      }

      const isAdvancedVote = contractMode.status === 'advanced'

      setTransactionState({
        phase: 'pending',
        option,
        txHash: '',
        message: isAdvancedVote
          ? `Awaiting signature for ${getOptionLabel(option)} and reward minting...`
          : `Awaiting signature for ${getOptionLabel(option)}...`,
      })

      try {
        const client = createSigningClient(activeAddress, async (xdr, options) => {
          const signed = await StellarWalletsKit.signTransaction(xdr, {
            address: activeAddress,
            networkPassphrase:
              options?.networkPassphrase ?? POLL_NETWORK_PASSPHRASE,
          })

          return {
            signedTxXdr: signed.signedTxXdr,
            signerAddress: signed.signerAddress,
          }
        })

        const assembled = isAdvancedVote
          ? await client.vote_for({
              voter: activeAddress,
              option,
            })
          : await client.vote({
              option,
            })

        const sent = await assembled.signAndSend({
          watcher: {
            onSubmitted: (response) => {
              if (!response?.hash) {
                return
              }

              setTransactionState((currentState) => ({
                ...currentState,
                txHash: response.hash,
                message: isAdvancedVote
                  ? 'Transaction submitted. Waiting for vote confirmation and reward minting...'
                  : 'Transaction submitted. Waiting for final confirmation...',
              }))
            },
          },
        })

        const txHash =
          sent.getTransactionResponse?.txHash ??
          sent.sendTransactionResponse?.hash ??
          ''

        setLastReceipt({
          option,
          txHash,
          mode: isAdvancedVote ? 'advanced' : 'legacy',
        })
        setTransactionState({
          phase: 'success',
          option,
          txHash,
          message: isAdvancedVote
            ? `${getOptionLabel(option)} is confirmed and the reward contract has been invoked.`
            : `${getOptionLabel(option)} is now confirmed on Testnet.`,
        })

        await Promise.all([
          loadVotes({
            silent: true,
          }),
          loadContractMode(),
          isAdvancedVote ? loadWalletInsights(activeAddress) : Promise.resolve(),
        ])
      } catch (error) {
        setTransactionState({
          phase: 'failed',
          option,
          txHash: '',
          message: classifyError(error).message,
        })
      }
    },
    [
      connectWallet,
      contractMode.status,
      loadContractMode,
      loadVotes,
      loadWalletInsights,
      selectedWallet,
      walletAddress,
      walletPassphrase,
    ],
  )

  const refreshOnChainData = useCallback(() => {
    void loadVotes({
      silent: true,
    })
    void loadContractMode()

    if (walletAddress && contractMode.status === 'advanced') {
      void loadWalletInsights(walletAddress)
    }
  }, [contractMode.status, loadContractMode, loadVotes, loadWalletInsights, walletAddress])

  const copyContractId = async () => {
    try {
      await navigator.clipboard.writeText(POLL_CONTRACT_ID)
      setCopiedContract(true)
      window.setTimeout(() => setCopiedContract(false), 1800)
    } catch {
      setVoteError('Clipboard access failed. Copy the contract ID manually.')
    }
  }

  useEffect(() => {
    let isCancelled = false
    const initTimeoutId = window.setTimeout(() => {
      if (isCancelled) {
        return
      }

      void refreshWallets()
      void loadVotes({
        silent: Boolean(initialVoteCache),
      })
      void loadContractMode()
    }, 0)

    initWalletKit()

    if (shouldStayDisconnectedRef.current) {
      void StellarWalletsKit.disconnect().catch(() => {
        clearWalletConnectionState()
      })
      clearWalletConnectionState()
    }

    const unsubscribeStateUpdated = StellarWalletsKit.on(
      KitEventType.STATE_UPDATED,
      ({ payload }) => {
        if (isCancelled) {
          return
        }

        if (shouldStayDisconnectedRef.current) {
          clearWalletConnectionState()
          return
        }

        setWalletAddress(payload.address || '')
        setWalletPassphrase(payload.networkPassphrase || '')
        setWalletNetwork(formatNetworkName(payload.networkPassphrase))
      },
    )

    const unsubscribeWalletSelected = StellarWalletsKit.on(
      KitEventType.WALLET_SELECTED,
      ({ payload }) => {
        if (isCancelled) {
          return
        }

        setSelectedWalletId(payload.id || '')
      },
    )

    const unsubscribeDisconnect = StellarWalletsKit.on(
      KitEventType.DISCONNECT,
      () => {
        if (isCancelled) {
          return
        }

        clearWalletConnectionState()
      },
    )

    return () => {
      isCancelled = true
      window.clearTimeout(initTimeoutId)
      unsubscribeStateUpdated?.()
      unsubscribeWalletSelected?.()
      unsubscribeDisconnect?.()
    }
  }, [clearWalletConnectionState, loadContractMode, loadVotes, refreshWallets])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (contractMode.status === 'advanced' && walletAddress) {
        void loadWalletInsights(walletAddress)
        return
      }

      setWalletInsights(createEmptyWalletInsights())
      setInsightsError('')
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [contractMode.status, loadWalletInsights, walletAddress])

  useEffect(() => {
    const updateVisibility = () => {
      setPageHealth((currentState) => ({
        ...currentState,
        visibility: document.visibilityState,
      }))
    }

    const updateOnline = () => {
      setPageHealth((currentState) => ({
        ...currentState,
        online: navigator.onLine,
      }))
    }

    document.addEventListener('visibilitychange', updateVisibility)
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)

    return () => {
      document.removeEventListener('visibilitychange', updateVisibility)
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [])

  useEffect(() => {
    let isCancelled = false
    let cursor = ''
    let pollTimeoutId = 0

    const eventServer = createEventServer()
    const pollDelay = pageHealth.visibility === 'hidden' ? 10_000 : 3_000
    const retryDelay = pageHealth.online ? 12_000 : 15_000

    const schedulePoll = (delay) => {
      pollTimeoutId = window.setTimeout(() => {
        void pollEvents()
      }, delay)
    }

    const applyEvents = (events) => {
      const parsedEvents = events.map(parsePollEvent).filter(Boolean)

      if (!parsedEvents.length) {
        return false
      }

      parsedEvents.forEach((event) => applyParsedPollEvent(event))

      const newestEvent = parsedEvents[parsedEvents.length - 1]
      setSyncState({
        status: 'live',
        message: `Live from ledger ${newestEvent.ledger}.`,
      })

      return true
    }

    const bootstrapEvents = async () => {
      setSyncState({
        status: 'starting',
        message: 'Connecting to Soroban events...',
      })

      if (!pageHealth.online) {
        setSyncState({
          status: 'error',
          message: 'Offline mode: waiting to resume Soroban event sync.',
        })
        schedulePoll(retryDelay)
        return
      }

      try {
        const latestLedger = await eventServer.getLatestLedger()

        if (isCancelled) {
          return
        }

        const response = await eventServer.getEvents({
          startLedger: Math.max(latestLedger.sequence - 4, 1),
          filters: pollEventsFilters,
          limit: 40,
        })

        if (isCancelled) {
          return
        }

        cursor = response.cursor
        const hadEvents = applyEvents(response.events)

        if (!hadEvents) {
          setSyncState({
            status: 'live',
            message:
              pageHealth.visibility === 'hidden'
                ? `Background sync active from ledger ${latestLedger.sequence}.`
                : `Listening live from ledger ${latestLedger.sequence}.`,
          })
        }

        schedulePoll(pollDelay)
      } catch (error) {
        if (isCancelled) {
          return
        }

        setSyncState({
          status: 'error',
          message: `Event sync unavailable: ${formatError(error)}`,
        })
        schedulePoll(retryDelay)
      }
    }

    const pollEvents = async () => {
      if (!pageHealth.online) {
        setSyncState({
          status: 'error',
          message: 'Offline mode: waiting to resume Soroban event sync.',
        })
        schedulePoll(retryDelay)
        return
      }

      if (!cursor) {
        await bootstrapEvents()
        return
      }

      try {
        const response = await eventServer.getEvents({
          cursor,
          filters: pollEventsFilters,
          limit: 40,
        })

        if (isCancelled) {
          return
        }

        cursor = response.cursor
        const hadEvents = applyEvents(response.events)

        if (!hadEvents) {
          setSyncState((currentState) =>
            currentState.status === 'error'
              ? {
                  status: 'live',
                  message: 'Event stream reconnected. Listening for new votes and rewards.',
                }
              : currentState,
          )
        }

        schedulePoll(pollDelay)
      } catch (error) {
        if (isCancelled) {
          return
        }

        setSyncState({
          status: 'error',
          message: `Event sync paused: ${formatError(error)}`,
        })
        schedulePoll(retryDelay)
      }
    }

    void bootstrapEvents()

    return () => {
      isCancelled = true
      window.clearTimeout(pollTimeoutId)
    }
  }, [applyParsedPollEvent, pageHealth.online, pageHealth.visibility])

  return (
    <div className="app-shell">
      <section className="band masthead-band">
        <div className="band-inner masthead">
          <div className="masthead-copy">
            <span className="eyebrow">Stellar Testnet · On-Chain Voting</span>
            <h1>Cast your vote on Soroban and watch results land in real time.</h1>
            <p className="lead">
              Connects to your browser wallet, detects whether the reward
              contract is deployed, and streams every vote and mint event
              straight from the ledger as it happens.
            </p>
          </div>

          <div className="masthead-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={refreshWallets}
              disabled={isLoadingWallets}
            >
              {isLoadingWallets ? 'Checking wallets...' : 'Refresh wallets'}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={refreshOnChainData}
              disabled={isRefreshingVotes}
            >
              {isRefreshingVotes ? 'Refreshing...' : 'Refresh chain data'}
            </button>
            {isWalletConnected ? (
              <button
                type="button"
                className="primary-button"
                onClick={disconnectWallet}
              >
                Disconnect wallet
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="band overview-band">
        <div className="band-inner overview-grid">
          <div className="summary-panel">
            <div className="summary-header">
              <span className={`status-pill tone-${walletState.tone}`}>
                {walletState.label}
              </span>
              <span className={`sync-pill tone-${syncTone}`}>
                {syncState.status === 'live' ? 'Live sync on' : 'Live sync paused'}
              </span>
              <span className={`sync-pill tone-${contractState.tone}`}>
                {contractState.label}
              </span>
            </div>

            <div className="summary-metrics">
              <article className="metric-card">
                <span className="metric-label">Votes cast</span>
                <strong>{totalVotes}</strong>
              </article>
              <article className="metric-card">
                <span className="metric-label">Out in front</span>
                <strong>{leadingOption}</strong>
              </article>
              <article className="metric-card">
                <span className="metric-label">Reward rate</span>
                <strong>{rewardMetricValue}</strong>
              </article>
              <article className="metric-card">
                <span className="metric-label">Last synced</span>
                <strong>{lastUpdatedAt || 'Fetching…'}</strong>
              </article>
            </div>

            {walletAddress ? (
              <p className="wallet-line">
                Active wallet <span>{formatAddress(walletAddress)}</span>
              </p>
            ) : (
              <p className="wallet-line muted">
                Select a wallet below to sign and submit transactions.
              </p>
            )}

            <p className="sync-line">
              {syncState.message} Poll interval: {cadenceLabel}.
            </p>
          </div>

          <div className="detail-panel">
            <div className="detail-row">
              <span>Poll contract</span>
              <div className="detail-value">
                <code>{contractIdPreview}</code>
                <button
                  type="button"
                  className="text-button"
                  onClick={copyContractId}
                >
                  {copiedContract ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="detail-row">
              <span>Reward contract</span>
              <code>
                {contractMode.rewardContract
                  ? formatContractPreview(contractMode.rewardContract)
                  : 'Not yet deployed'}
              </code>
            </div>
            <div className="detail-row">
              <span>RPC endpoint</span>
              <code>{POLL_RPC_URL}</code>
            </div>
            <div className="detail-row">
              <span>Network</span>
              <code>{walletNetwork || 'Stellar Testnet'}</code>
            </div>
            <div className="detail-row">
              <span>Active wallet</span>
              <code>{selectedWallet?.name || 'None selected'}</code>
            </div>
          </div>
        </div>
      </section>

      <section className="band wallet-band">
        <div className="band-inner">
          <div className="section-heading">
            <div>
              <h2>Connect a wallet</h2>
              <p>
                Powered by StellarWalletsKit — pick your wallet from the list
                and link it with one click.
              </p>
            </div>
            <span className="network-pill">
              {availableWalletCount} wallet
              {availableWalletCount === 1 ? '' : 's'} available
            </span>
          </div>

          {walletError ? (
            <div className="notice error-notice">{walletError}</div>
          ) : null}

          <div className="wallet-picker-panel">
            <div className="wallet-picker-controls">
              <label className="wallet-select-field" htmlFor="wallet-picker">
                <span>Select wallet</span>
                <select
                  id="wallet-picker"
                  className="wallet-select"
                  value={selectedWalletId}
                  onChange={(event) => {
                    setSelectedWalletId(event.target.value)
                    setWalletError('')
                  }}
                  disabled={isLoadingWallets || !supportedWallets.length}
                >
                  {supportedWallets.length ? null : (
                    <option value="">No wallets found</option>
                  )}
                  {supportedWallets.map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.name} - {wallet.isAvailable ? 'Available' : 'Not found'}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                className="primary-button"
                onClick={() => connectWallet(selectedWallet)}
                disabled={
                  !selectedWallet?.isAvailable || Boolean(isConnectingWalletId)
                }
              >
                {isConnectingWalletId === selectedWallet?.id
                  ? 'Connecting...'
                  : isWalletConnected && selectedWallet?.id === selectedWalletId
                    ? `Reconnect ${selectedWallet?.name ?? 'wallet'}`
                    : `Connect ${selectedWallet?.name ?? 'wallet'}`}
              </button>
            </div>

            <div className="wallet-selection-meta">
              <div className="wallet-selection-copy">
                <h3>{selectedWallet?.name || 'No wallet selected'}</h3>
                <p className="wallet-meta">
                  {selectedWallet
                    ? `${selectedWallet.type} wallet`
                    : 'Scan for browser extensions by hitting Refresh wallets.'}
                </p>
              </div>
              <span
                className={`availability-pill tone-${
                  selectedWallet?.isAvailable ? 'success' : 'muted'
                }`}
              >
                {selectedWallet?.isAvailable ? 'Available' : 'Not found'}
              </span>
            </div>

            <div className="wallet-selection-actions">
              <p className="muted">
                {availableWalletCount
                  ? `${availableWalletCount} wallet${
                      availableWalletCount === 1 ? '' : 's'
                    } ready in this browser.`
                  : 'No compatible wallet found — install one and hit Refresh wallets.'}
              </p>

              {selectedWallet?.url ? (
                <a href={selectedWallet.url} target="_blank" rel="noreferrer">
                  Open wallet page
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="band voting-band">
        <div className="band-inner">
          <div className="section-heading">
            <div>
              <h2>Ballot</h2>
              <p>
                Every vote is a live Soroban transaction. With the reward
                contract active, each signed vote also triggers a token mint
                via an inter-contract call.
              </p>
            </div>
          </div>

          {refreshError ? (
            <div className="notice error-notice">{refreshError}</div>
          ) : null}

          {voteError ? <div className="notice error-notice">{voteError}</div> : null}

          {!isOnTestnet && isWalletConnected ? (
            <div className="notice warning-notice">
              {selectedWallet?.name || 'Your wallet'} is connected to{' '}
              {walletNetwork || 'another network'}. Switch it to Testnet before
              you submit a vote.
            </div>
          ) : null}

          <div className="options-grid">
            {POLL_OPTIONS.map(({ symbol, label, accentClass }) => {
              const votes = counts[symbol] ?? 0
              const share = totalVotes ? Math.round((votes / totalVotes) * 100) : 0
              const isPending =
                transactionState.phase === 'pending' &&
                transactionState.option === symbol

              return (
                <article key={symbol} className={`option-card ${accentClass}`}>
                  <div className="option-head">
                    <div>
                      <span className="option-chip">{symbol}</span>
                      <h3>{label}</h3>
                    </div>
                    <strong>{votes}</strong>
                  </div>

                  <div className="bar-track" aria-hidden="true">
                    <div className="bar-fill" style={{ width: `${share}%` }} />
                  </div>

                  <div className="option-meta">
                    <span>{share}% of all votes</span>
                    <span>{votes === 1 ? '1 vote' : `${votes} votes`}</span>
                  </div>

                  <button
                    type="button"
                    className="vote-button"
                    onClick={() => handleVote(symbol)}
                    disabled={
                      transactionState.phase === 'pending' || Boolean(isConnectingWalletId)
                    }
                  >
                    {isPending ? 'Broadcasting…' : `Back ${label}`}
                  </button>
                </article>
              )
            })}
          </div>

          {isLoadingVotes ? (
            <p className="loading-line">Fetching on-chain tallies…</p>
          ) : null}
        </div>
      </section>

      <section className="band insights-band">
        <div className="band-inner insights-grid">
          <div className="insight-panel">
            <div className="panel-heading">
              <h2>Earnings tracker</h2>
              <span className={`tx-pill tone-${contractState.tone}`}>
                {contractMode.status}
              </span>
            </div>

            {contractMode.status === 'advanced' ? (
              <>
                <div className="insight-metrics">
                  <article className="stat-card">
                    <span className="stat-label">Points per vote</span>
                    <strong>{contractMode.rewardRate}</strong>
                  </article>
                  <article className="stat-card">
                    <span className="stat-label">Your balance</span>
                    <strong>
                      {isWalletConnected ? walletInsights.rewardBalance : '--'}
                    </strong>
                  </article>
                  <article className="stat-card">
                    <span className="stat-label">Your votes</span>
                    <strong>
                      {isWalletConnected ? walletInsights.voterVotes : '--'}
                    </strong>
                  </article>
                </div>

                {isWalletConnected ? (
                  <p className="section-note">
                    Reward data last pulled{' '}
                    {walletInsights.lastSyncedAt || 'just now'}.
                  </p>
                ) : (
                  <p className="muted">
                    Link a wallet to view your personal point balance and vote history.
                  </p>
                )}

                {lastRewardEvent ? (
                  <div className="notice info-notice">
                    Reward minted: {lastRewardEvent.amount} pts for {getOptionLabel(lastRewardEvent.option)}. Running balance: {lastRewardEvent.balance}.
                  </div>
                ) : (
                  <p className="muted">
                    No reward events yet — cast a vote to trigger the first mint.
                  </p>
                )}
              </>
            ) : (
              <div className="notice info-notice">
                {contractMode.message}
              </div>
            )}

            {insightsError ? (
              <div className="notice warning-notice">{insightsError}</div>
            ) : null}
          </div>

          <div className="insight-panel">
            <div className="panel-heading">
              <h2>System status</h2>
              <span className={`tx-pill tone-${pageHealth.online ? 'success' : 'warning'}`}>
                {pageHealth.online ? 'online' : 'offline'}
              </span>
            </div>

            <div className="ops-list">
              <div className="ops-row">
                <span className="ops-label">Contract mode</span>
                <strong className="ops-value">{contractState.label}</strong>
              </div>
              <div className="ops-row">
                <span className="ops-label">Event stream</span>
                <strong className="ops-value">{syncState.message}</strong>
              </div>
              <div className="ops-row">
                <span className="ops-label">Page visibility</span>
                <strong className="ops-value">
                  {pageHealth.visibility} / {pageHealth.online ? 'connected' : 'offline'}
                </strong>
              </div>
              <div className="ops-row">
                <span className="ops-label">Poll interval</span>
                <strong className="ops-value">{cadenceLabel}</strong>
              </div>
              <div className="ops-row">
                <span className="ops-label">Pipeline</span>
                <strong className="ops-value">GitHub Actions + Vercel</strong>
              </div>
            </div>

            <p className="muted">
              Contract tests, lint, and build checks all run on every push.
              Deployments roll out automatically from the main branch via Vercel.
            </p>
          </div>
        </div>
      </section>

      <section className="band activity-band">
        <div className="band-inner activity-grid">
          <div className="activity-panel">
            <div className="panel-heading">
              <h2>Latest transaction</h2>
              <span className={`tx-pill tone-${transactionTone}`}>
                {transactionState.phase}
              </span>
            </div>

            <p>{transactionState.message}</p>

            {transactionState.option ? (
              <p className="muted">
                Chosen option: <strong>{getOptionLabel(transactionState.option)}</strong>
              </p>
            ) : null}

            {lastReceipt ? (
              <div className="receipt">
                <p>
                  Confirmed vote: <strong>{getOptionLabel(lastReceipt.option)}</strong>
                </p>
                <p className="muted">
                  Method: {lastReceipt.mode === 'advanced' ? 'rewarded vote' : 'legacy vote'}
                </p>
                {lastReceipt.txHash ? (
                  <a
                    href={buildExplorerTransactionUrl(lastReceipt.txHash)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View receipt on Explorer
                  </a>
                ) : null}
              </div>
            ) : null}

            {transactionState.txHash ? (
              <a
                href={buildExplorerTransactionUrl(transactionState.txHash)}
                target="_blank"
                rel="noreferrer"
              >
                Track on Stellar Expert
              </a>
            ) : null}
          </div>

          <div className="activity-panel">
            <div className="panel-heading">
              <h2>Live activity</h2>
              <span className={`tx-pill tone-${syncTone}`}>
                {deferredActivityFeed.length || 0}
              </span>
            </div>

            {lastVoteEvent ? (
              <p className="muted">
                Most recent tally: <strong>{getOptionLabel(lastVoteEvent.option)}</strong>{' '}
                is at <strong>{lastVoteEvent.votes}</strong>.
              </p>
            ) : null}

            {deferredActivityFeed.length ? (
              <ul className="activity-feed">
                {deferredActivityFeed.map((entry) => (
                  <li key={entry.key} className="feed-item">
                    <div className="feed-top">
                      <strong>{entry.title}</strong>
                      <span className="feed-badge">{entry.badge}</span>
                    </div>
                    <p>{entry.detail}</p>
                    <div className="feed-meta">
                      <span>Ledger {entry.ledger}</span>
                      <span>{entry.timestamp || 'Just now'}</span>
                      {entry.txHash ? (
                        <a
                          href={buildExplorerTransactionUrl(entry.txHash)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View transaction
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">
                No events yet — activity will appear here as votes come in.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

export default App
