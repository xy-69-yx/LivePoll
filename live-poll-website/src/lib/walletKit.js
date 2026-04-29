import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk'
import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils'
import { KitEventType, Networks } from '@creit.tech/stellar-wallets-kit/types'

let isInitialized = false

export const initWalletKit = () => {
  if (isInitialized) {
    return
  }

  StellarWalletsKit.init({
    modules: defaultModules(),
    network: Networks.TESTNET,
    authModal: {
      hideUnsupportedWallets: false,
      showInstallLabel: true,
    },
  })

  isInitialized = true
}

export { KitEventType, Networks, StellarWalletsKit }
