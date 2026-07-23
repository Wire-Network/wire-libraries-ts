import {
  SysioContractName,
  SysioTokensChainkind,
  SysioTokensTokenkind
} from "../../../types/SysioContractTypes.js"
import type * as SysioContracts from "../../../types/SysioContractTypes.js"
import { getSysioContract, type SysioContractClient } from "../Client.js"
import {
  reserveRowSlugValue,
  reserveSlugString,
  reserveSlugValue
} from "../reserv/Slug.js"

import {
  DEFAULT_TOKENS_CONTRACT,
  DEFAULT_TOKEN_QUERY_LIMIT
} from "./Constants.js"
import type {
  ChainTokenRecord,
  ListChainTokensOptions,
  ListTokenRegistryOptions,
  RegisteredAsset,
  TokenRecord,
  TokenRegistryClientOptions
} from "./Types.js"

function bigintValue(value: number | string): bigint {
  return BigInt(value.toString())
}

function enumValue<T extends Record<string, string | number>>(
  enumType: T,
  value: number | keyof T
): number {
  if (typeof value === "number") return value
  const mapped = enumType[value]
  if (mapped == null) {
    throw new Error(`Unknown token enum value: ${String(value)}`)
  }
  return Number(mapped)
}

/** Normalizes a generated `sysio.tokens::tokens` row. */
export function normalizeTokenRow(
  row: SysioContracts.SysioTokensTokenRowType
): TokenRecord {
  const codeValue = reserveRowSlugValue(row.code)

  return {
    code: reserveSlugString(codeValue),
    codeValue,
    kind: enumValue(SysioTokensTokenkind, row.kind) as SysioTokensTokenkind,
    symbol: row.symbol_name,
    description: row.description,
    precision: row.precision,
    addressKind: enumValue(
      SysioTokensChainkind,
      row.address.kind
    ) as SysioTokensChainkind,
    address: row.address.address,
    active: row.active,
    registeredAtMs: bigintValue(row.registered_at_ms),
    activatedAtMs: bigintValue(row.activated_at_ms),
    raw: row
  }
}

/** Normalizes a generated `sysio.tokens::chaintokens` row. */
export function normalizeChainTokenRow(
  row: SysioContracts.SysioTokensChainTokenRowType
): ChainTokenRecord {
  const chainCodeValue = reserveRowSlugValue(row.chain_code),
    tokenCodeValue = reserveRowSlugValue(row.token_code)

  return {
    chainCode: reserveSlugString(chainCodeValue),
    chainCodeValue,
    tokenCode: reserveSlugString(tokenCodeValue),
    tokenCodeValue,
    contractAddress: row.contract_addr,
    isNative: row.is_native,
    active: row.active,
    registeredAtMs: bigintValue(row.registered_at_ms),
    activatedAtMs: bigintValue(row.activated_at_ms),
    raw: row
  }
}

/** UI-neutral client for the on-chain token and chain-token registry. */
export class TokenRegistryClient {
  /** Generic typed client for direct public action and table access. */
  readonly contractClient: SysioContractClient<SysioContractName.tokens>

  /** Creates a token registry client. */
  constructor(config: TokenRegistryClientOptions) {
    this.contractClient = getSysioContract(SysioContractName.tokens, {
      client: config.client,
      contract: config.contract || DEFAULT_TOKENS_CONTRACT
    })
  }

  /** Lists normalized canonical token metadata. */
  async listTokens(
    options: ListTokenRegistryOptions = {}
  ): Promise<TokenRecord[]> {
    const result = await this.contractClient.tables.tokens.query({
      limit: Math.max(Math.floor(options.limit || DEFAULT_TOKEN_QUERY_LIMIT), 1)
    })

    return result.rows
      .map(normalizeTokenRow)
      .filter(record => options.includeInactive || record.active)
  }

  /** Lists normalized chain-token bindings with optional slug filters. */
  async listChainTokens(
    options: ListChainTokensOptions = {}
  ): Promise<ChainTokenRecord[]> {
    const result = await this.contractClient.tables.chaintokens.query({
        limit: Math.max(
          Math.floor(options.limit || DEFAULT_TOKEN_QUERY_LIMIT),
          1
        )
      }),
      chainCode =
        options.chainCode == null ? null : reserveSlugValue(options.chainCode),
      tokenCode =
        options.tokenCode == null ? null : reserveSlugValue(options.tokenCode)

    return result.rows
      .map(normalizeChainTokenRow)
      .filter(
        record =>
          (options.includeInactive || record.active) &&
          (chainCode == null || record.chainCodeValue === chainCode) &&
          (tokenCode == null || record.tokenCodeValue === tokenCode)
      )
  }

  /** Joins active token metadata to active chain deployments. */
  async listAssets(
    options: ListChainTokensOptions = {}
  ): Promise<RegisteredAsset[]> {
    const [tokens, chainTokens] = await Promise.all([
        this.listTokens(options),
        this.listChainTokens(options)
      ]),
      byCode = new Map(tokens.map(token => [token.codeValue, token]))

    return chainTokens.flatMap(chainToken => {
      const token = byCode.get(chainToken.tokenCodeValue)
      return token ? [{ token, chainToken }] : []
    })
  }

  /** Reads one registered asset, or null when either registry row is absent. */
  async getAsset(
    chainCode: string | number | bigint,
    tokenCode: string | number | bigint
  ): Promise<RegisteredAsset> {
    const asset = (
      await this.listAssets({ chainCode, tokenCode, includeInactive: true })
    )[0]
    return asset || null
  }
}
