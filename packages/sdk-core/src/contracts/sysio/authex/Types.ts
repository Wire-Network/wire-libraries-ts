import type { TransactionExtraOptions } from "../../../api/Types.js"
import type { Action } from "../../../chain/Action.js"
import type { NameType } from "../../../chain/Name.js"
import type { PublicKeyType } from "../../../chain/PublicKey.js"
import type { SignatureType } from "../../../chain/Signature.js"
import type { SignerProvider } from "../../../signing/SignerProvider.js"
import type * as SystemContracts from "../../../types/SystemContractTypes.js"
import type { APIClient } from "../../../api/Client.js"

/** AuthEx chain kind enum generated from `sysio.authex::ChainKind`. */
export type AuthexChainKind = SystemContracts.SysioAuthexChainkind

/** Supported user-created AuthEx link chain kinds. */
export type AuthexSupportedLinkChainKind =
  | SystemContracts.SysioAuthexChainkind.CHAIN_KIND_EVM
  | SystemContracts.SysioAuthexChainkind.CHAIN_KIND_SVM

/** Configuration for `AuthexClient`. */
export interface AuthexClientOptions {
  /** Chain API client used for RPC reads and optional signed pushes. */
  client: APIClient
  /** AuthEx contract account. Defaults to `sysio.authex`. */
  contract?: NameType
}

/** Options for building `sysio.authex::createlink`. */
export interface BuildCreateLinkActionOptions {
  /** Wire account being linked. */
  account: NameType
  /** External chain kind, currently EVM or SVM. */
  chainKind: AuthexChainKind
  /** External-wallet proof signature in Wire signature format. */
  signature: SignatureType
  /** External-chain public key in Wire public-key format. */
  publicKey: PublicKeyType
  /** Millisecond nonce. Defaults to `Date.now()`. */
  nonce?: number
  /** Wire account permission authorizing the action. Defaults to `active`. */
  permission?: NameType
  /** AuthEx contract account override. Defaults to `sysio.authex`. */
  contract?: NameType
}

/** Options for building `sysio.authex::recordlink`. */
export interface BuildRecordLinkActionOptions {
  /** Wire account being linked. */
  account: NameType
  /** External chain kind, currently EVM or SVM. */
  chainKind: AuthexChainKind
  /** External-chain public key in Wire public-key format. */
  publicKey: PublicKeyType
  /** AuthEx contract account override. Defaults to `sysio.authex`. */
  contract?: NameType
}

/** Options for building `sysio.authex::clearlinks`. */
export interface BuildClearLinksActionOptions {
  /** AuthEx contract account override. Defaults to `sysio.authex`. */
  contract?: NameType
}

/** Data needed before asking an external wallet for its create-link proof. */
export interface PreparedCreateLink {
  /** Wire account being linked. */
  account: string
  /** External chain kind. */
  chainKind: AuthexSupportedLinkChainKind
  /** External-chain public key as the contract will render it. */
  publicKey: string
  /** Millisecond nonce used in the proof message. */
  nonce: number
  /** Human-readable contract message that is hashed per chain. */
  message: string
  /** Byte payload that the external wallet must sign. */
  signingPayload: Uint8Array
}

/** Options for preparing a create-link wallet proof. */
export interface PrepareCreateLinkOptions {
  /** Wire account being linked. */
  account: NameType
  /** External chain kind, currently EVM or SVM. */
  chainKind: AuthexChainKind
  /** External-chain public key in Wire public-key format. */
  publicKey: PublicKeyType
  /** Millisecond nonce. Defaults to `Date.now()`. */
  nonce?: number
}

/** Signed create-link proof returned by the SDK signer helpers. */
export interface SignedCreateLinkProof extends PreparedCreateLink {
  /** External-wallet proof signature in Wire signature format. */
  signature: string
}

/** Options for signing and building `sysio.authex::createlink`. */
export interface CreateLinkWithSignerOptions
  extends Omit<PrepareCreateLinkOptions, "publicKey"> {
  /** Signer for the external wallet being linked. */
  signer: SignerProvider
  /** External-chain public key. Defaults to `signer.pubKey`. */
  publicKey?: PublicKeyType
  /** Wire account permission authorizing the action. Defaults to `active`. */
  permission?: NameType
  /** AuthEx contract account override. Defaults to `sysio.authex`. */
  contract?: NameType
}

/** Result of preparing and building a create-link action. */
export interface CreateLinkActionResult {
  /** Prepared external-wallet proof data. */
  proof: SignedCreateLinkProof
  /** Unsigned Wire action ready to submit as `account@permission`. */
  action: Action
}

/** Options for listing AuthEx link rows. */
export interface ListLinksOptions {
  /** Maximum rows to read. Defaults to 100. */
  limit?: number
}

/** Options for pushing a signed create-link transaction. */
export interface PushCreateLinkOptions extends CreateLinkWithSignerOptions {
  /** Optional push behavior such as waiting for finality. */
  pushOptions?: TransactionExtraOptions
}
