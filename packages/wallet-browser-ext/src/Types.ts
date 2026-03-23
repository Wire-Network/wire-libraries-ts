export { KeyType } from "@wireio/sdk-core"

export enum ChainKind {
  WIRE = "WIRE",
  ETHEREUM = "ETHEREUM",
  SOLANA = "SOLANA",
  SUI = "SUI",
}

export interface KeyPair {
  id: string
  name: string
  type: import("@wireio/sdk-core").KeyType
  privateKey: string // PVT_K1_... format
  publicKey: string // PUB_K1_... format
  address?: string // for EM ethereum keys
}

export interface ChainEndpoint {
  id: string
  name: string
  kind: ChainKind
  url: string // defaults to http://localhost:8888
}

export interface WireAccount {
  id: string
  name: string // [a-z1-5\.] max 12 chars
  endpoints: string[] // endpoint ids
  keys: string[] // keypair ids
}

export interface ExtensionState {
  keys: KeyPair[]
  endpoints: ChainEndpoint[]
  accounts: WireAccount[]
  activeAccount?: {
    accountId: string
    keyId: string
    endpointId: string
  }
}

export type BackgroundMessage =
  | { type: "GET_STATE" }
  | { type: "UNLOCK"; password: string }
  | { type: "LOCK" }
  | { type: "SETUP"; password: string; initialState: ExtensionState }
  | { type: "SAVE_STATE"; state: ExtensionState }
  | {
      type: "SIGN_REQUEST"
      payload: { digest: string; accountId: string }
    }
  | { type: "GET_ACCOUNTS" }
  | { type: "IS_UNLOCKED" }
  | { type: "HAS_VAULT" }

export type BackgroundResponse =
  | { success: true; data?: any }
  | { success: false; error: string }
