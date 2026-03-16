import {Checksum256} from "@wireio/sdk-core"
/** Key types supported by Wire blockchain */
export enum KeyType {
  K1 = "K1",
  R1 = "R1",
  EM = "EM",
  ED = "ED",
}

/** Chain kinds supported by Wire */
export enum ChainKind {
  WIRE = "WIRE",
  ETHEREUM = "ETHEREUM",
  SOLANA = "SOLANA",
  SUI = "SUI",
}

/** Sign transaction request */
export interface SignTransactionRequest {
  /** Signing digest as hex string */
  digest: string
  /** Account ID to sign with */
  accountId: string
}

/** Sign transaction result */
export interface SignTransactionResult {
  /** Array of signature strings */
  signatures: string[]
}

/** Provider events */
export type WireWalletEvent =
  | "accountChanged"
  | "endpointChanged"
  | "lock"
  | "unlock"
  | "connect"
  | "disconnect"

/** Event handler type */
export type EventHandler = (...args: any[]) => void

/** The provider interface injected as window.__WIRE_WALLET__ */
export interface WireWalletProvider {
  /** Identifies this as the Wire Wallet */
  readonly isWireWallet: true

  /** Provider version */
  readonly version: string

  /** Check if the wallet is unlocked */
  isUnlocked(): Promise<boolean>

  /** Get all accounts configured in the wallet */
  getAccounts(): Promise<Array<{ id: string; name: string }>>

  /** Sign a transaction digest with the specified account */
  signTransaction(digest: string, accountId: string): Promise<string>

  /** Subscribe to wallet events */
  on(event: WireWalletEvent, handler: EventHandler): void

  /** Unsubscribe from wallet events */
  removeListener(event: WireWalletEvent, handler: EventHandler): void
}

/** Augment the global Window type */
declare global {
  interface Window {
    __WIRE_WALLET__?: WireWalletProvider
  }
}
