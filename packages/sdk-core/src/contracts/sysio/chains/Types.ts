import type { NameType } from "../../../chain/Name.js"
import type { ContractPermissionLevel } from "../../Contract.js"
import type * as SysioContracts from "../../../types/SysioContractTypes.js"
import type { APIClient } from "../../../api/Client.js"

/** Friendly string or packed numeric `slug_name` accepted by chain helpers. */
export type ChainSlugName = string | number | bigint

/** Configuration for `ChainsClient`. */
export interface ChainsClientOptions {
  /** Chain API client used for registry reads. */
  client: APIClient
  /** Chain registry contract account. Defaults to `sysio.chains`. */
  contract?: NameType
}

/** User-facing chain registration data. */
export interface ChainRegistration {
  /** VM/signing family used by the registered chain. */
  kind: SysioContracts.SysioChainsChainkind
  /** Stable protocol chain code, such as `ETHEREUM` or `SOLANA`. */
  code: ChainSlugName
  /** External numeric chain identifier recorded by the protocol. */
  externalChainId: number
  /** Human-readable chain name. */
  name: string
  /** Human-readable chain description. */
  description: string
}

/** Options for creating an unsigned `regchain` action. */
export interface CreateRegisterChainActionOptions {
  /** Chain registration written by the privileged action. */
  registration: ChainRegistration
  /** Permission levels authorizing the action. */
  authorization: ContractPermissionLevel[]
  /** Chain registry contract account override. */
  contract?: NameType
}

/** Options for creating an unsigned `activchain` action. */
export interface CreateActivateChainActionOptions {
  /** Stable protocol chain code to activate. */
  code: ChainSlugName
  /** Permission levels authorizing the action. */
  authorization: ContractPermissionLevel[]
  /** Chain registry contract account override. */
  contract?: NameType
}

/** Filters applied while reading registered chains. */
export interface ListChainsOptions {
  /** Return only active registry rows. */
  activeOnly?: boolean
  /** Include the Wire depot row. Defaults to true. */
  includeDepot?: boolean
  /** Return only one VM/signing family. */
  kind?: SysioContracts.SysioChainsChainkind
  /** Maximum matching rows to return. Defaults to 500. */
  limit?: number
}

/** Application-friendly representation of one `sysio.chains` row. */
export interface ChainRecord {
  /** Stable decoded protocol chain code. */
  code: string
  /** Packed numeric value of `code`. */
  codeValue: number
  /** VM/signing family used by the chain. */
  kind: SysioContracts.SysioChainsChainkind
  /** External numeric chain identifier recorded by the protocol. */
  externalChainId: number
  /** Human-readable chain name. */
  name: string
  /** Human-readable chain description. */
  description: string
  /** Whether this row describes the Wire depot itself. */
  isDepot: boolean
  /** Whether protocol routing has activated this chain. */
  active: boolean
  /** Registration time in Unix milliseconds. */
  registeredAtMs: bigint
  /** Activation time in Unix milliseconds, or zero before activation. */
  activatedAtMs: bigint
  /** Original generated registry row. */
  raw: SysioContracts.SysioChainsChainRowType
}
