import type { APIClient } from "../../../api/Client.js"
import type { Action } from "../../../chain/Action.js"
import type { NameType } from "../../../chain/Name.js"
import {
  SysioChainsChainkind,
  SysioContractName
} from "../../../types/SysioContractTypes.js"
import type * as SysioContracts from "../../../types/SysioContractTypes.js"
import type { ContractTableRowsOptions } from "../../Contract.js"
import { getSysioContract, type SysioContractClient } from "../Client.js"

import {
  createActivateChainAction,
  createRegisterChainAction
} from "./Actions.js"
import {
  DEFAULT_CHAINS_CONTRACT,
  DEFAULT_CHAIN_QUERY_LIMIT
} from "./Constants.js"
import { chainSlugString, chainSlugValue } from "./Slug.js"
import type {
  ChainRecord,
  ChainSlugName,
  ChainsClientOptions,
  CreateActivateChainActionOptions,
  CreateRegisterChainActionOptions,
  ListChainsOptions
} from "./Types.js"

function chainKindValue(
  value: SysioContracts.SysioChainsChainRowType["kind"]
): SysioContracts.SysioChainsChainkind {
  if (typeof value === "number") return value

  const serialized = String(value)
  if (/^[0-9]+$/.test(serialized)) {
    return Number(serialized) as SysioContracts.SysioChainsChainkind
  }

  const mapped = SysioChainsChainkind[value]
  if (mapped == null) {
    throw new Error(`Unknown chain kind: ${serialized}`)
  }

  return Number(mapped) as SysioContracts.SysioChainsChainkind
}

function rowSlugValue(value: SysioContracts.SysioChainsSlugNameType): number {
  return chainSlugValue(value.value)
}

/** Normalizes a generated chain registry row into application-friendly values. */
export function normalizeChainRow(
  row: SysioContracts.SysioChainsChainRowType
): ChainRecord {
  const codeValue = rowSlugValue(row.code)

  return {
    code: chainSlugString(codeValue),
    codeValue,
    kind: chainKindValue(row.kind),
    externalChainId: row.external_chain_id,
    name: row.name,
    description: row.description,
    isDepot: row.is_depot,
    active: row.active,
    registeredAtMs: BigInt(row.registered_at_ms.toString()),
    activatedAtMs: BigInt(row.activated_at_ms.toString()),
    raw: row
  }
}

/** UI-neutral client for `sysio.chains` discovery and privileged action creation. */
export class ChainsClient {
  /** Chain API client used for RPC calls. */
  readonly client: APIClient

  /** Chain registry contract account. */
  readonly contract: NameType

  /** Generic typed proxy for direct action and table access. */
  readonly contractClient: SysioContractClient<SysioContractName.chains>

  /** Creates a chain registry client. */
  constructor(config: ChainsClientOptions) {
    this.client = config.client
    this.contract = config.contract || DEFAULT_CHAINS_CONTRACT
    this.contractClient = getSysioContract(SysioContractName.chains, {
      client: config.client,
      contract: this.contract
    })
  }

  /** Creates an unsigned privileged chain registration action. */
  createRegisterChainAction(
    options: Omit<CreateRegisterChainActionOptions, "contract">
  ): Action {
    return createRegisterChainAction({ ...options, contract: this.contract })
  }

  /** Creates an unsigned privileged chain activation action. */
  createActivateChainAction(
    options: Omit<CreateActivateChainActionOptions, "contract">
  ): Action {
    return createActivateChainAction({ ...options, contract: this.contract })
  }

  /** Lists raw generated chain rows, scanning additional KV pages as needed. */
  async listChainRows(
    options: ListChainsOptions = {}
  ): Promise<SysioContracts.SysioChainsChainRowType[]> {
    const limit = Math.max(
        Math.floor(options.limit || DEFAULT_CHAIN_QUERY_LIMIT),
        1
      ),
      rows: SysioContracts.SysioChainsChainRowType[] = []
    let lowerBound: string | undefined

    do {
      const query: ContractTableRowsOptions<string> = {
          limit: DEFAULT_CHAIN_QUERY_LIMIT,
          ...(lowerBound ? { lower_bound: lowerBound } : {})
        },
        result = await this.contractClient.tables.chains.rows<string>(query),
        matches = result.rows.filter(row => {
          const kindMatches =
              options.kind == null || chainKindValue(row.kind) === options.kind,
            activeMatches = !options.activeOnly || row.active,
            depotMatches = options.includeDepot !== false || !row.is_depot

          return kindMatches && activeMatches && depotMatches
        })

      rows.push(...matches.slice(0, limit - rows.length))

      const nextKey = result.more ? result.next_key : undefined
      if (!nextKey || String(nextKey) === lowerBound) break
      lowerBound = String(nextKey)
    } while (rows.length < limit)

    return rows
  }

  /** Lists normalized registered chains with optional lifecycle/family filtering. */
  async listChains(options: ListChainsOptions = {}): Promise<ChainRecord[]> {
    return (await this.listChainRows(options)).map(normalizeChainRow)
  }

  /** Reads one registered chain by exact chain code, or null when absent. */
  async getChain(code: ChainSlugName): Promise<ChainRecord> {
    const codeValue = chainSlugValue(code),
      rows = await this.listChainRows({ limit: Number.MAX_SAFE_INTEGER }),
      row = rows.find(candidate => rowSlugValue(candidate.code) === codeValue)

    return row ? normalizeChainRow(row) : null
  }
}
