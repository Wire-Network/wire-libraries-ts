import type { APIClient } from "../../../api/Client.js"
import type { NameType } from "../../../chain/Name.js"
import type {
  SysioTokensChainkind,
  SysioTokensTokenkind
} from "../../../types/SysioContractTypes.js"
import type * as SysioContracts from "../../../types/SysioContractTypes.js"

/** Configuration for the `sysio.tokens` registry client. */
export interface TokenRegistryClientOptions {
  /** Chain API client used for table reads. */
  client: APIClient
  /** Registry contract override. Defaults to `sysio.tokens`. */
  contract?: NameType
}

/** Filters shared by normalized token registry reads. */
export interface ListTokenRegistryOptions {
  /** Return inactive records when true. Defaults to active records only. */
  includeInactive?: boolean
  /** Maximum rows returned. Defaults to 500. */
  limit?: number
}

/** Filters for chain-specific token bindings. */
export interface ListChainTokensOptions extends ListTokenRegistryOptions {
  /** Optional chain slug filter. */
  chainCode?: string | number | bigint
  /** Optional token slug filter. */
  tokenCode?: string | number | bigint
}

/** Normalized token metadata registered on Wire. */
export interface TokenRecord {
  /** Friendly token slug. */
  code: string
  /** Packed token slug. */
  codeValue: number
  /** Canonical token classification. */
  kind: SysioTokensTokenkind
  /** Display ticker or symbol. */
  symbol: string
  /** Human-readable registry description. */
  description: string
  /** Token precision used by its native representation. */
  precision: number
  /** Chain family of the canonical token address. */
  addressKind: SysioTokensChainkind
  /** Canonical address bytes returned by the chain API. */
  address: string
  /** Whether the token can be used by protocol flows. */
  active: boolean
  /** Registration timestamp in milliseconds. */
  registeredAtMs: bigint
  /** Activation timestamp in milliseconds. */
  activatedAtMs: bigint
  /** Original generated table row. */
  raw: SysioContracts.SysioTokensTokenRowType
}

/** Normalized token deployment on one registered external chain. */
export interface ChainTokenRecord {
  /** Friendly external-chain slug. */
  chainCode: string
  /** Packed external-chain slug. */
  chainCodeValue: number
  /** Friendly token slug. */
  tokenCode: string
  /** Packed token slug. */
  tokenCodeValue: number
  /** Contract or mint address bytes returned by the chain API. */
  contractAddress: string
  /** Whether the chain treats this asset as its native currency. */
  isNative: boolean
  /** Whether this chain/token binding can be used by protocol flows. */
  active: boolean
  /** Registration timestamp in milliseconds. */
  registeredAtMs: bigint
  /** Activation timestamp in milliseconds. */
  activatedAtMs: bigint
  /** Original generated table row. */
  raw: SysioContracts.SysioTokensChainTokenRowType
}

/** Token metadata joined to one active chain deployment. */
export interface RegisteredAsset {
  /** Canonical token metadata. */
  token: TokenRecord
  /** Chain-specific contract or native-asset binding. */
  chainToken: ChainTokenRecord
}
