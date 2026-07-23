import { match } from "ts-pattern"

import { APIClient } from "../../../api/Client.js"
import { Action } from "../../../chain/Action.js"
import { Bytes } from "../../../chain/Bytes.js"
import { Name, NameType } from "../../../chain/Name.js"
import { SignedTransaction } from "../../../chain/Transaction.js"
import { Serializer } from "../../../serializer/index.js"
import { SysioContractName } from "../../../types/SysioContractTypes.js"
import { getSysioContract, type SysioContractClient } from "../Client.js"

import { buildGetProposalAction } from "./Actions.js"
import { detectMsigCapabilities } from "./Capabilities.js"
import { DEFAULT_MSIG_CONTRACT } from "./Constants.js"
import { getProposalPackedTransactionSize, isChunkedProposal } from "./Hash.js"
import { createProposalDetail } from "./Proposal.js"
import {
  MsigApprovalsInfo,
  MsigInvalidation,
  MsigOldApprovalsInfo,
  MsigPropChunk,
  MsigProposal
} from "./Structs.js"
import { FeatureError } from "./FeatureError.js"
import type {
  ListProposalScopesOptions,
  ListProposalsOptions,
  MsigApprovalsResult,
  MsigCapabilities,
  MsigClientOptions,
  MsigReadStrategy,
  MsigTableName,
  ProposalDetail
} from "./Types.js"

interface MsigNamedRow {
  proposal_name?: NameType
  account?: NameType
}

function nameString(value: NameType): string {
  return Name.from(value).toString()
}

function rowNameEquals(
  row: MsigNamedRow,
  field: keyof MsigNamedRow,
  value: NameType
): boolean {
  const rowValue = row[field]

  return rowValue ? Name.from(rowValue as NameType).equals(value) : false
}

function numberFromOptionalUInt32(value: unknown): number {
  if (value == null) {
    return 0
  }

  if (typeof value === "number") {
    return value
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toNumber" in value &&
    typeof value.toNumber === "function"
  ) {
    return value.toNumber()
  }

  return Number(value)
}

function isReadOnlyUnavailableError(error: unknown): boolean {
  const message = String(error).toLowerCase()

  return (
    message.includes("send_read_only_transaction") ||
    message.includes("read-only transactions execution not enabled")
  )
}

function isKvBoundReadError(error: unknown): boolean {
  const message = String(error).toLowerCase()

  return (
    message.includes("parse_error_exception") ||
    message.includes("bad_cast_exception")
  )
}

interface ProposalReadResult {
  proposal: MsigProposal
  readStrategy: MsigReadStrategy
}

/** Decodes the return value emitted by read-only `sysio.msig::getproposal`. */
export function decodeReadOnlyProposalReturn(response: any): MsigProposal {
  const traces = response?.processed?.action_traces || [],
    trace =
      traces.find((candidate: any) => candidate?.act?.name === "getproposal") ||
      traces[0],
    value =
      trace?.return_value_data ??
      trace?.return_value ??
      trace?.return_value_hex_data ??
      trace?.return_value_data_hex

  if (!value) {
    throw new Error(
      "Unable to find getproposal return value in read-only transaction trace."
    )
  }

  return typeof value === "string"
    ? (Serializer.decode({ data: value, type: MsigProposal }) as MsigProposal)
    : MsigProposal.from(value)
}

/** Client for UI-neutral `sysio.msig` reads and proposal detail shaping. */
export class MsigClient {
  /** Chain API client used for RPC calls. */
  readonly client: APIClient

  /** Multisig contract account. */
  readonly contract: NameType

  /** Generic typed contract proxy used by the higher-level workflow helpers. */
  readonly contractClient: SysioContractClient<SysioContractName.msig>

  private readonly configuredReadStrategy: MsigClientOptions["readStrategy"]
  private capabilities: Promise<MsigCapabilities> | null = null

  /** Creates a multisig client. */
  constructor(config: MsigClientOptions) {
    this.client = config.client
    this.contract = config.contract || DEFAULT_MSIG_CONTRACT
    this.contractClient = getSysioContract(SysioContractName.msig, {
      client: config.client,
      contract: this.contract
    })
    this.configuredReadStrategy = config.readStrategy || "auto"
  }

  /** Returns cached ABI-derived `sysio.msig` capabilities. */
  async getCapabilities(): Promise<MsigCapabilities> {
    if (!this.capabilities) {
      this.capabilities = detectMsigCapabilities(this.client, this.contract)
    }

    return this.capabilities
  }

  /** Returns the detected contract profile. */
  async getProfile(): Promise<MsigCapabilities["profile"]> {
    return (await this.getCapabilities()).profile
  }

  /** Returns the selected read strategy after applying configuration and ABI support. */
  async getReadStrategy(): Promise<MsigReadStrategy> {
    return this.selectReadStrategy(await this.getCapabilities())
  }

  /** Lists proposer scopes with entries in the `proposal` table. */
  async listProposalScopes(
    options: ListProposalScopesOptions = {}
  ): Promise<string[]> {
    return this.contractClient.tables.proposal.scopes({
      ...(options.lowerBound
        ? { lower_bound: Name.from(options.lowerBound).toString() }
        : {}),
      ...(options.upperBound
        ? { upper_bound: Name.from(options.upperBound).toString() }
        : {}),
      limit: options.limit || 100
    })
  }

  /** Reads a proposal row or reassembled chunked proposal. */
  async getProposal(
    proposer: NameType,
    proposalName: NameType
  ): Promise<MsigProposal> {
    const capabilities = await this.getCapabilities()

    return (
      await this.readProposalWithCapabilities(
        capabilities,
        proposer,
        proposalName
      )
    ).proposal
  }

  /** Reads a proposal with decoded transaction, hash, approvals, and status data. */
  async getProposalDetail(
    proposer: NameType,
    proposalName: NameType
  ): Promise<ProposalDetail> {
    const capabilities = await this.getCapabilities(),
      result = await this.readProposalWithCapabilities(
        capabilities,
        proposer,
        proposalName
      ),
      approvals = await this.getApprovals(proposer, proposalName)

    return createProposalDetail({
      proposer: nameString(proposer),
      proposal: result.proposal,
      approvals,
      capabilities,
      readStrategy: result.readStrategy
    })
  }

  /** Lists proposals in a single proposer scope. */
  async listProposals(
    proposer: NameType,
    options: ListProposalsOptions = {}
  ): Promise<MsigProposal[]> {
    const limit = options.limit || 100
    let rows: any[]

    try {
      const result = await this.contractClient.tables.proposal.query({
        scope: nameString(proposer),
        ...(options.lowerBound
          ? { lower_bound: Name.from(options.lowerBound as NameType) }
          : {}),
        ...(options.upperBound
          ? { upper_bound: Name.from(options.upperBound as NameType) }
          : {}),
        limit
      })

      rows = result.rows
    } catch (error) {
      if (!isKvBoundReadError(error)) {
        throw error
      }

      rows = await this.getScopedRows(
        proposer,
        "proposal",
        Math.max(limit, 1000)
      )
    }

    if (options.lowerBound || options.upperBound) {
      const lowerBound = options.lowerBound
          ? Name.from(options.lowerBound as NameType)
          : null,
        upperBound = options.upperBound
          ? Name.from(options.upperBound as NameType)
          : null

      rows = rows.filter((row: any) => {
        if (!row.proposal_name) {
          return false
        }

        const name = Name.from(row.proposal_name),
          lowerOk = !lowerBound || name.value.gte(lowerBound.value),
          upperOk = !upperBound || name.value.lte(upperBound.value)

        return lowerOk && upperOk
      })
    }

    return rows.slice(0, limit).map((row: any) => MsigProposal.from(row))
  }

  /** Reads modern approvals and falls back to legacy approvals when needed. */
  async getApprovals(
    proposer: NameType,
    proposalName: NameType
  ): Promise<MsigApprovalsResult> {
    const modern = await this.getExactScopedRow(
      proposer,
      "approvals2",
      proposalName
    )

    if (modern) {
      return {
        kind: "approvals2",
        approvals: MsigApprovalsInfo.from(modern)
      }
    }

    // Legacy `sysio.msig` deployments can still expose the old approvals table.
    // Keep this fallback narrow so chunked-v2 continues to prefer `approvals2`.
    const legacy = await this.getExactScopedRow(
      proposer,
      "approvals",
      proposalName
    )

    if (legacy) {
      return {
        kind: "legacy",
        approvals: MsigOldApprovalsInfo.from(legacy)
      }
    }

    return null
  }

  /** Reads an account invalidation row, when present. */
  async getInvalidation(account: NameType): Promise<MsigInvalidation> {
    const rows = await this.getScopedRows(this.contract, "invals"),
      row = rows.find((candidate: any) =>
        rowNameEquals(candidate, "account", account)
      )

    return row ? MsigInvalidation.from(row) : null
  }

  private async readProposalWithCapabilities(
    capabilities: MsigCapabilities,
    proposer: NameType,
    proposalName: NameType
  ): Promise<ProposalReadResult> {
    const strategy = this.selectReadStrategy(capabilities)

    return match(strategy)
      .with("read-only-getproposal", async () => {
        const action = buildGetProposalAction(
          proposer,
          proposalName,
          this.contract
        )

        try {
          const response = await this.sendReadOnlyAction(action)

          return {
            proposal: decodeReadOnlyProposalReturn(response),
            readStrategy: "read-only-getproposal" as const
          }
        } catch (error) {
          if (!isReadOnlyUnavailableError(error)) {
            throw error
          }

          return {
            proposal: await this.getProposalFromTables(
              capabilities,
              proposer,
              proposalName
            ),
            readStrategy: "chunk-table" as const
          }
        }
      })
      .otherwise(async () => ({
        proposal: await this.getProposalFromTables(
          capabilities,
          proposer,
          proposalName
        ),
        readStrategy: strategy
      }))
  }

  private async getProposalFromTables(
    capabilities: MsigCapabilities,
    proposer: NameType,
    proposalName: NameType
  ): Promise<MsigProposal> {
    // Legacy contracts do not expose read-only `getproposal`, so scoped
    // `proposal` table reads remain the compatibility path. Chunked-v2 uses
    // this only as an RPC-node fallback when read-only execution is disabled.
    const row = await this.getExactScopedRow(proposer, "proposal", proposalName)

    if (!row) {
      throw new Error(
        `Proposal not found: ${nameString(proposer)}/${nameString(proposalName)}`
      )
    }

    const proposal = MsigProposal.from(row)

    if (
      capabilities.supports.chunkedProposals &&
      isChunkedProposal(proposal) &&
      getProposalPackedTransactionSize(proposal) === 0
    ) {
      return this.assembleChunkedProposalFromTables(proposer, proposal)
    }

    return proposal
  }

  private async assembleChunkedProposalFromTables(
    proposer: NameType,
    proposal: MsigProposal
  ): Promise<MsigProposal> {
    const chunkCount = numberFromOptionalUInt32(proposal.chunk_count),
      totalSize = numberFromOptionalUInt32(proposal.total_size),
      rows = await this.getScopedRows(
        proposer,
        "propchunks",
        Math.max(chunkCount, 1000)
      ),
      chunks = rows
        .map((row: any) => MsigPropChunk.from(row))
        .filter(chunk => chunk.proposal_name.equals(proposal.proposal_name))
        .sort(
          (a, b) =>
            numberFromOptionalUInt32(a.chunk_index) -
            numberFromOptionalUInt32(b.chunk_index)
        )

    if (chunks.length !== chunkCount) {
      throw new Error(
        `Proposal ${nameString(proposer)}/${proposal.proposal_name} expected ${chunkCount} chunks, found ${chunks.length}.`
      )
    }

    const initial = {
        packed: new Uint8Array(totalSize),
        offset: 0
      },
      assembled = chunks.reduce((state, chunk) => {
        state.packed.set(chunk.data.array, state.offset)
        return {
          packed: state.packed,
          offset: state.offset + chunk.data.array.length
        }
      }, initial)

    if (assembled.offset !== totalSize) {
      throw new Error(
        `Proposal ${nameString(proposer)}/${proposal.proposal_name} chunk size mismatch: expected ${totalSize}, assembled ${assembled.offset}.`
      )
    }

    proposal.packed_transaction = Bytes.from(assembled.packed)

    return proposal
  }

  private async sendReadOnlyAction(action: Action): Promise<any> {
    const info = await this.client.v1.chain.get_info(),
      transaction = SignedTransaction.from({
        ...info.getTransactionHeader(),
        context_free_actions: [],
        actions: [action],
        transaction_extensions: [],
        signatures: [],
        context_free_data: []
      })

    return this.client.v1.chain.send_read_only_transaction(transaction)
  }

  private selectReadStrategy(capabilities: MsigCapabilities): MsigReadStrategy {
    // Auto-detection makes the new chunked-v2 contract the primary path while
    // preserving legacy contracts that only support scoped table reads.
    const strategy =
      this.configuredReadStrategy === "auto"
        ? capabilities.readStrategy
        : this.configuredReadStrategy

    if (
      strategy === "read-only-getproposal" &&
      !capabilities.supports.readOnlyGetProposal
    ) {
      throw new FeatureError(
        "read-only getproposal",
        capabilities,
        `${capabilities.contract} does not expose read-only sysio.msig::getproposal.`
      )
    }

    if (strategy === "legacy-table" && !capabilities.supports.legacyTableRead) {
      throw new FeatureError(
        "legacy proposal table reads",
        capabilities,
        `${capabilities.contract} does not expose a readable proposal table.`
      )
    }

    if (strategy === "chunk-table" && !capabilities.supports.chunkedProposals) {
      throw new FeatureError(
        "chunk table proposal reads",
        capabilities,
        `${capabilities.contract} does not expose chunked proposal table fields.`
      )
    }

    return strategy
  }

  private async getExactScopedRow(
    scope: NameType,
    table: MsigTableName,
    proposalName: NameType
  ): Promise<any> {
    let rows: any[]

    try {
      const result = await this.contractClient.tables[table].query({
        scope: nameString(scope),
        lower_bound: Name.from(proposalName),
        limit: 1
      })

      rows = result.rows
    } catch (error) {
      if (!isKvBoundReadError(error)) {
        throw error
      }
      rows = []
    }

    const row =
      rows.find((candidate: any) =>
        rowNameEquals(candidate, "proposal_name", proposalName)
      ) ||
      (await this.getScopedRows(scope, table)).find((candidate: any) =>
        rowNameEquals(candidate, "proposal_name", proposalName)
      ) ||
      null

    return row
  }

  private async getScopedRows(
    scope: NameType,
    table: MsigTableName,
    limit = 1000
  ): Promise<any[]> {
    const result = await this.contractClient.tables[table].query({
      scope: nameString(scope),
      limit
    })

    return result.rows
  }
}
