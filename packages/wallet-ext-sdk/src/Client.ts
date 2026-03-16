import type {
  WireWalletProvider,
  WireWalletEvent,
  EventHandler,
  SignTransactionRequest,
  SignTransactionResult,
} from "./Types"
import { WalletNotFoundError } from "./Errors"
declare global {
  interface Window {
    __WIRE_WALLET__?: WireWalletProvider
  }
}

export class WireWalletClient {
  private provider: WireWalletProvider | null = null

  /** Get the provider, throwing if not available */
  private getProvider(): WireWalletProvider {
    if (this.provider) return this.provider
    if (typeof window !== "undefined" && window.__WIRE_WALLET__) {
      this.provider = window.__WIRE_WALLET__
      return this.provider
    }
    throw new WalletNotFoundError()
  }

  /** Check if the Wire Wallet extension is installed */
  isInstalled(): boolean {
    return typeof window !== "undefined" && !!window.__WIRE_WALLET__
  }

  /** Wait for the provider to be available (with timeout) */
  async waitForProvider(timeoutMs = 3000): Promise<WireWalletProvider> {
    if (this.isInstalled()) return this.getProvider()

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new WalletNotFoundError())
      }, timeoutMs)

      const check = () => {
        if (this.isInstalled()) {
          clearTimeout(timeout)
          resolve(this.getProvider())
        } else {
          setTimeout(check, 100)
        }
      }
      check()
    })
  }

  /** Check if the wallet is unlocked */
  async isUnlocked(): Promise<boolean> {
    return this.getProvider().isUnlocked()
  }

  /** Get all accounts configured in the wallet */
  async getAccounts(): Promise<Array<{ id: string; name: string }>> {
    return this.getProvider().getAccounts()
  }

  /** Sign a transaction */
  async signTransaction(request: SignTransactionRequest): Promise<SignTransactionResult> {
    const signature = await this.getProvider().signTransaction(
      request.digest,
      request.accountId
    )
    return {
      signatures: [signature],
    }
  }

  /** Subscribe to a wallet event */
  on(event: WireWalletEvent, handler: EventHandler): void {
    this.getProvider().on(event, handler)
  }

  /** Unsubscribe from a wallet event */
  removeListener(event: WireWalletEvent, handler: EventHandler): void {
    this.getProvider().removeListener(event, handler)
  }
}
