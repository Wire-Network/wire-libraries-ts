import { Name } from "../../../chain/Name.js"
import {
  SysioContractName,
  SysioUwritAttestationtype,
  SysioUwritChainkind,
  SysioUwritUnderwriterequeststatus,
  SysioUwritUnderwritestatus
} from "../../../types/SysioContractTypes.js"
import type * as SysioContracts from "../../../types/SysioContractTypes.js"
import { getSysioContract, type SysioContractClient } from "../Client.js"
import {
  reserveRowSlugValue,
  reserveSlugString,
  reserveSlugValue
} from "../reserv/Slug.js"

import { swapFromWireActionData } from "./Actions.js"
import {
  DEFAULT_UWRIT_CONTRACT,
  DEFAULT_UWRIT_QUERY_LIMIT
} from "./Constants.js"
import type {
  FromWireQueueRecord,
  ListFromWireQueueOptions,
  ListUnderwritingRequestsOptions,
  SwapFromWireOptions,
  UnderwritingClientOptions,
  UnderwritingCommitRecord,
  UnderwritingConfig,
  UnderwritingRequestRecord
} from "./Types.js"

interface ReserveIdentitySlugs {
  chain: SysioContracts.SysioUwritSlugNameType
  token: SysioContracts.SysioUwritSlugNameType
  reserve: SysioContracts.SysioUwritSlugNameType
}

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
    throw new Error(`Unknown underwriting enum value: ${String(value)}`)
  }
  return Number(mapped)
}

function identity(
  chain: ReserveIdentitySlugs["chain"],
  token: ReserveIdentitySlugs["token"],
  reserve: ReserveIdentitySlugs["reserve"]
) {
  return {
    chainCode: reserveSlugString(reserveRowSlugValue(chain)),
    tokenCode: reserveSlugString(reserveRowSlugValue(token)),
    reserveCode: reserveSlugString(reserveRowSlugValue(reserve))
  }
}

function hexBytes(value: string): number[] {
  const normalized = String(value || "")
    .trim()
    .replace(/^0x/i, "")
  if (
    !normalized ||
    normalized.length % 2 !== 0 ||
    !/^[0-9a-f]+$/i.test(normalized)
  ) {
    return []
  }
  const pairs = normalized.match(/.{2}/g)
  return pairs ? pairs.map(pair => Number.parseInt(pair, 16)) : []
}

function sourceRequestId(
  value: string,
  wireOrigin: boolean
): bigint | undefined {
  const bytes = hexBytes(value)
  if (bytes.length !== 8) return undefined
  const ordered = wireOrigin ? [...bytes].reverse() : bytes
  return ordered.reduce((result, byte) => (result << 8n) | BigInt(byte), 0n)
}

function wireDepositorAccount(value: string): string | undefined {
  const bytes = hexBytes(value)
  if (!bytes.length) return undefined
  try {
    return Name.from(String.fromCharCode(...bytes)).toString()
  } catch {
    return undefined
  }
}

function normalizeCommit(
  row: SysioContracts.SysioUwritCommitEntryType
): UnderwritingCommitRecord {
  return {
    underwriter: row.underwriter,
    sourceReceivedAtMs: bigintValue(row.source_received_at_ms),
    destinationReceivedAtMs: bigintValue(row.dest_received_at_ms),
    status: enumValue(
      SysioUwritUnderwritestatus,
      row.status
    ) as SysioUwritUnderwritestatus,
    reason: row.reason,
    raw: row
  }
}

/** Normalizes a generated `sysio.uwrit::uwreqs` row. */
export function normalizeUnderwritingRequest(
  row: SysioContracts.SysioUwritUwRequestTType
): UnderwritingRequestRecord {
  const source = identity(
      row.src_chain_code,
      row.src_token_code,
      row.src_reserve_code
    ),
    wireOrigin = source.chainCode === "WIRE"

  return {
    id: bigintValue(row.id),
    type: enumValue(
      SysioUwritAttestationtype,
      row.type
    ) as SysioUwritAttestationtype,
    status: enumValue(
      SysioUwritUnderwriterequeststatus,
      row.status
    ) as SysioUwritUnderwriterequeststatus,
    source,
    sourceAmount: bigintValue(row.src_amount),
    destination: identity(
      row.dst_chain_code,
      row.dst_token_code,
      row.dst_reserve_code
    ),
    destinationAmount: bigintValue(row.dst_amount),
    toleranceBps: row.variance_tolerance_bps,
    sourceTransactionId: row.source_tx_id,
    sourceRequestId: sourceRequestId(row.source_tx_id, wireOrigin),
    depositor: row.depositor,
    depositorAccount: wireOrigin
      ? wireDepositorAccount(row.depositor)
      : undefined,
    commits: row.commits_by.map(normalizeCommit),
    winner: row.winner,
    settledAtMs: bigintValue(row.settled_at_ms),
    expiresAtEpoch: row.expires_at_epoch,
    raw: row
  }
}

/** Normalizes a generated `sysio.uwrit::fwqueue` row. */
export function normalizeFromWireQueue(
  row: SysioContracts.SysioUwritFromwireQType
): FromWireQueueRecord {
  return {
    id: bigintValue(row.id),
    user: row.user,
    wireAmount: bigintValue(row.wire_amount),
    destination: identity(
      row.dst_chain_code,
      row.dst_token_code,
      row.dst_reserve_code
    ),
    targetAmount: bigintValue(row.target_amount),
    toleranceBps: row.variance_tolerance_bps,
    recipientKind: enumValue(
      SysioUwritChainkind,
      row.recipient_kind
    ) as SysioUwritChainkind,
    recipientAddress: row.recipient_addr,
    createdAtEpoch: row.created_at_epoch,
    raw: row
  }
}

/** UI-neutral client for swap underwriting reads and WIRE-origin submission. */
export class UnderwritingClient {
  /** Generic typed client for direct public action and table access. */
  readonly contractClient: SysioContractClient<SysioContractName.uwrit>

  /** Creates an underwriting client. */
  constructor(config: UnderwritingClientOptions) {
    this.contractClient = getSysioContract(SysioContractName.uwrit, {
      client: config.client,
      contract: config.contract || DEFAULT_UWRIT_CONTRACT
    })
  }

  /** Lists normalized protocol swap requests. */
  async listRequests(
    options: ListUnderwritingRequestsOptions = {}
  ): Promise<UnderwritingRequestRecord[]> {
    const result = await this.contractClient.tables.uwreqs.query({
        limit: Math.max(
          Math.floor(options.limit || DEFAULT_UWRIT_QUERY_LIMIT),
          1
        )
      }),
      sourceChain =
        options.sourceChainCode == null
          ? null
          : reserveSlugValue(options.sourceChainCode),
      destinationChain =
        options.destinationChainCode == null
          ? null
          : reserveSlugValue(options.destinationChainCode)

    return result.rows
      .map(normalizeUnderwritingRequest)
      .filter(
        record =>
          (options.status == null || record.status === options.status) &&
          (sourceChain == null ||
            reserveSlugValue(record.source.chainCode) === sourceChain) &&
          (destinationChain == null ||
            reserveSlugValue(record.destination.chainCode) === destinationChain)
      )
  }

  /** Reads one protocol swap request, or null when absent. */
  async getRequest(
    id: number | string | bigint
  ): Promise<UnderwritingRequestRecord> {
    const result = await this.contractClient.tables.uwreqs.query({
        lower_bound: id.toString(),
        upper_bound: id.toString(),
        limit: 1
      }),
      row = result.rows[0]
    return row ? normalizeUnderwritingRequest(row) : null
  }

  /** Lists WIRE-origin swaps waiting for the next epoch drain. */
  async listFromWireQueue(
    options: ListFromWireQueueOptions = {}
  ): Promise<FromWireQueueRecord[]> {
    const result = await this.contractClient.tables.fwqueue.query({
        limit: Math.max(
          Math.floor(options.limit || DEFAULT_UWRIT_QUERY_LIMIT),
          1
        )
      }),
      user = options.user ? Name.from(options.user).toString() : null

    return result.rows
      .map(normalizeFromWireQueue)
      .filter(record => !user || record.user === user)
  }

  /** Reads the active underwriting configuration, or null before initialization. */
  async getConfig(): Promise<UnderwritingConfig> {
    const row = await this.contractClient.tables.uwconfig.first()
    return row
      ? {
          feeBps: row.fee_bps,
          collateralLockDurationMs: bigintValue(
            row.collateral_lock_duration_ms
          ),
          minimumFromWireAmount: bigintValue(row.min_fromwire_amount),
          fromWireRevertFeeBps: row.fromwire_revert_fee_bps
        }
      : null
  }

  /** Escrows WIRE and queues a signed WIRE-to-external swap. */
  async pushSwapFromWire(
    options: SwapFromWireOptions
  ): Promise<
    Awaited<ReturnType<typeof this.contractClient.actions.swapfromwire.invoke>>
  > {
    return this.contractClient.actions.swapfromwire.invoke(
      swapFromWireActionData(options),
      {
        authorization: [
          {
            actor: options.user,
            permission: options.permission || "active"
          }
        ],
        pushOptions: options.pushOptions
      }
    )
  }
}
