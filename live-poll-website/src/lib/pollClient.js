import { Client as LivePollClient } from '@contract-client'
import { nativeToScVal, Networks, rpc, scValToNative } from '@stellar/stellar-sdk'

export const POLL_RPC_URL =
  import.meta.env.VITE_POLL_RPC_URL ?? 'https://stellar-soroban-testnet-public.nodies.app'
export const POLL_NETWORK_PASSPHRASE = Networks.TESTNET
export const POLL_CONTRACT_ID =
  import.meta.env.VITE_POLL_CONTRACT_ID ??
  'CC43GCB3LMRLKQ6JFJCPNT2QJXVOK73Y5HWAF7RZAYIMRL322I7WIZ6L'

export const POLL_OPTIONS = [
  {
    symbol: 'OptionA',
    label: 'Option A',
    accentClass: 'mint',
  },
  {
    symbol: 'OptionB',
    label: 'Option B',
    accentClass: 'coral',
  },
]

const sharedClientOptions = {
  contractId: POLL_CONTRACT_ID,
  networkPassphrase: POLL_NETWORK_PASSPHRASE,
  rpcUrl: POLL_RPC_URL,
}

export const createReadClient = () => new LivePollClient(sharedClientOptions)

export const createSigningClient = (address, signWithWallet) =>
  new LivePollClient({
    ...sharedClientOptions,
    publicKey: address,
    signTransaction: (xdr, options) =>
      signWithWallet(xdr, {
        ...options,
        address,
      }),
  })

export const createEventServer = () => new rpc.Server(POLL_RPC_URL)

const buildTopicXdr = (name) =>
  nativeToScVal(name, {
    type: 'symbol',
  }).toXDR('base64')

export const VOTED_EVENT_TOPIC_XDR = buildTopicXdr('voted')
export const REWARDED_EVENT_TOPIC_XDR = buildTopicXdr('rewarded')

export const pollEventsFilters = [
  {
    type: 'contract',
    contractIds: [POLL_CONTRACT_ID],
    topics: [[VOTED_EVENT_TOPIC_XDR]],
  },
  {
    type: 'contract',
    contractIds: [POLL_CONTRACT_ID],
    topics: [[REWARDED_EVENT_TOPIC_XDR]],
  },
]

const normalizeNumeric = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const parsePollEvent = (event) => {
  if (!event?.topic?.length) {
    return null
  }

  const eventName = scValToNative(event.topic[0])

  if (eventName === 'voted' && event.topic.length >= 2) {
    const option = scValToNative(event.topic[1])
    const votes = normalizeNumeric(scValToNative(event.value))

    if (!option || !Number.isFinite(votes)) {
      return null
    }

    return {
      type: 'vote',
      option: String(option),
      votes,
      txHash: event.txHash,
      ledger: event.ledger,
      ledgerClosedAt: event.ledgerClosedAt,
    }
  }

  if (eventName === 'rewarded' && event.topic.length >= 2) {
    const option = scValToNative(event.topic[1])
    const rewardData = scValToNative(event.value)
    const [amount, balance] = Array.isArray(rewardData)
      ? rewardData
      : [rewardData?.amount, rewardData?.balance]

    if (!option) {
      return null
    }

    return {
      type: 'reward',
      option: String(option),
      amount: normalizeNumeric(amount),
      balance: normalizeNumeric(balance),
      txHash: event.txHash,
      ledger: event.ledger,
      ledgerClosedAt: event.ledgerClosedAt,
    }
  }

  return null
}

export const buildExplorerTransactionUrl = (hash) =>
  `https://stellar.expert/explorer/testnet/tx/${hash}`
