import type { APIClient } from "../../../api/Client.js"
import type { ABIDef } from "../../../chain/Abi.js"
import type { AnyAction } from "../../../chain/Action.js"
import type { Checksum256, Checksum256Type } from "../../../chain/Checksum.js"
import type { NameType } from "../../../chain/Name.js"
import type { PermissionLevelType } from "../../../chain/PermissionLevel.js"
import type {
  Transaction,
  TransactionHeaderType,
  TransactionType
} from "../../../chain/Transaction.js"
import type * as SysioContracts from "../../../types/SysioContractTypes.js"

import type {
  MsigApprovalsInfo,
  MsigInvalidation,
  MsigOldApprovalsInfo,
  MsigProposal
} from "./Structs.js"

/** Permission level input accepted by multisig action builders. */
export type MsigPermissionLevel =
  | PermissionLevelType
  | SysioContracts.SysioMsigPermissionLevelType
  | string

/** Configuration for `MsigClient`. */
export interface MsigClientOptions {
  /** Chain API client used for RPC reads and read-only transactions. */
  client: APIClient
  /** Multisig contract account. Defaults to `sysio.msig`. */
  contract?: NameType
  /** Proposal read strategy. Defaults to ABI-driven auto detection. */
  readStrategy?: MsigReadStrategy | "auto"
}

/** Options for building `sysio.msig::propose`. */
export interface BuildProposeActionOptions {
  /** Account creating the proposal. */
  proposer: NameType
  /** Proposal name. */
  proposalName: NameType
  /** Requested approver permission levels. */
  requested: MsigPermissionLevel[]
  /** Inner transaction proposed for execution. */
  transaction: TransactionType
  /** Proposer permission to authorize with. Defaults to `active`. */
  proposerPermission?: NameType
  /** Multisig contract account. Defaults to `sysio.msig`. */
  contract?: NameType
}

/** Options for building `sysio.msig::approve`. */
export interface BuildApproveActionOptions {
  /** Account that created the proposal. */
  proposer: NameType
  /** Proposal name. */
  proposalName: NameType
  /** Approving permission level. */
  level: MsigPermissionLevel
  /** Optional proposal hash required by chunked-v2 contracts. */
  proposalHash?: Checksum256Type | Checksum256 | null
  /** Multisig contract account. Defaults to `sysio.msig`. */
  contract?: NameType
}

/** Options for building `sysio.msig::unapprove`. */
export interface BuildUnapproveActionOptions {
  /** Account that created the proposal. */
  proposer: NameType
  /** Proposal name. */
  proposalName: NameType
  /** Permission level removing its approval. */
  level: MsigPermissionLevel
  /** Multisig contract account. Defaults to `sysio.msig`. */
  contract?: NameType
}

/** Options for building `sysio.msig::cancel`. */
export interface BuildCancelActionOptions {
  /** Account that created the proposal. */
  proposer: NameType
  /** Proposal name. */
  proposalName: NameType
  /** Account canceling the proposal. */
  canceler: NameType
  /** Canceler permission to authorize with. Defaults to `active`. */
  cancelerPermission?: NameType
  /** Multisig contract account. Defaults to `sysio.msig`. */
  contract?: NameType
}

/** Options for building `sysio.msig::exec`. */
export interface BuildExecActionOptions {
  /** Account that created the proposal. */
  proposer: NameType
  /** Proposal name. */
  proposalName: NameType
  /** Account executing the proposal. */
  executer: NameType
  /** Executer permission to authorize with. Defaults to `active`. */
  executerPermission?: NameType
  /** Multisig contract account. Defaults to `sysio.msig`. */
  contract?: NameType
}

/** Options for building `sysio.msig::invalidate`. */
export interface BuildInvalidateActionOptions {
  /** Account invalidating existing approvals. */
  account: NameType
  /** Permission to authorize with. Defaults to `active`. */
  permission?: NameType
  /** Multisig contract account. Defaults to `sysio.msig`. */
  contract?: NameType
}

/** Options for listing proposal rows in one proposer scope. */
export interface ListProposalsOptions {
  /** Maximum rows to return. */
  limit?: number
  /** Lower proposal-name bound. */
  lowerBound?: NameType | string
  /** Upper proposal-name bound. */
  upperBound?: NameType | string
}

/** Options for listing scopes that contain proposal rows. */
export interface ListProposalScopesOptions {
  /** Maximum scopes to return. */
  limit?: number
  /** Lower scope bound. */
  lowerBound?: NameType | string
  /** Upper scope bound. */
  upperBound?: NameType | string
}

/** Options for constructing an inner proposal transaction from a known header. */
export interface BuildProposalTransactionOptions {
  /** Transaction header to use for the proposal payload. */
  header: TransactionHeaderType
  /** Actions included in the proposed transaction. */
  actions: AnyAction[]
  /** ABIs used to encode action data. */
  abis?: ABIDef | { contract: NameType; abi: ABIDef }[]
}

/** Options for constructing an inner proposal transaction from current chain info. */
export interface CreateProposalTransactionOptions {
  /** Actions included in the proposed transaction. */
  actions: AnyAction[]
  /** Expiration offset in seconds. Defaults to one hour. */
  expirationSeconds?: number
  /** ABIs used to encode action data. */
  abis?: ABIDef | { contract: NameType; abi: ABIDef }[]
}

/** Decoded action inside a proposal transaction. */
export interface DecodedProposalAction {
  /** Action account. */
  account: string
  /** Action name. */
  name: string
  /** Authorization list as `<actor>@<permission>` strings. */
  authorization: string[]
  /** Decoded data when ABI decoding succeeds. */
  data: unknown
  /** Raw action data bytes as hex. */
  rawData: string
  /** Whether action data decoded successfully. */
  decoded: boolean
  /** Decode failure reason when `decoded` is false. */
  error: string | null
}

/** ABI profile detected for a deployed `sysio.msig` contract. */
export type MsigProfile = "legacy" | "chunked-v2" | "unknown"

/** Strategy used to read proposal bytes. */
export type MsigReadStrategy =
  | "legacy-table"
  | "read-only-getproposal"
  | "chunk-table"

/** Supported `sysio.msig` action names. */
export type MsigActionName =
  | "propose"
  | "approve"
  | "unapprove"
  | "cancel"
  | "exec"
  | "invalidate"
  | "getproposal"

/** Supported `sysio.msig` table names. */
export type MsigTableName =
  | "proposal"
  | "approvals2"
  | "approvals"
  | "invals"
  | "propchunks"

/** Proposal fields used for profile and read-strategy detection. */
export type MsigProposalFieldName =
  | "proposal_name"
  | "packed_transaction"
  | "earliest_exec_time"
  | "chunk_count"
  | "total_size"
  | "trx_hash"

/** ABI-derived feature matrix for a deployed `sysio.msig` contract. */
export interface MsigCapabilities {
  /** Contract account inspected. */
  contract: string
  /** Whether an ABI was available. */
  hasAbi: boolean
  /** Detected contract profile. */
  profile: MsigProfile
  /** Preferred read strategy for the detected profile. */
  readStrategy: MsigReadStrategy
  /** Action availability flags. */
  actions: Record<MsigActionName, boolean>
  /** Table availability flags. */
  tables: Record<MsigTableName, boolean>
  /** Proposal field availability flags. */
  proposalFields: Record<MsigProposalFieldName, boolean>
  /** Action result availability flags. */
  actionResults: {
    /** Whether `getproposal` has an ABI return value. */
    getproposal: boolean
  }
  /** Approve action field availability flags. */
  approveFields: {
    /** Whether `approve` supports the proposal hash extension. */
    proposal_hash: boolean
  }
  /** Aggregated feature support flags. */
  supports: {
    /** Base write actions required by legacy and chunked profiles. */
    baseActions: boolean
    /** Base tables required by legacy and chunked profiles. */
    baseTables: boolean
    /** Whether scoped `proposal` table reads can be used. */
    legacyTableRead: boolean
    /** Whether read-only `getproposal` can return full proposal bytes. */
    readOnlyGetProposal: boolean
    /** Whether proposal chunk tables and metadata fields are available. */
    chunkedProposals: boolean
    /** Whether proposal rows expose a transaction hash. */
    proposalHash: boolean
    /** Whether approvals may include the proposal hash extension. */
    approveProposalHash: boolean
    /** Whether modern approvals are available. */
    approvals2: boolean
    /** Whether legacy approvals are available. */
    legacyApprovals: boolean
    /** Whether invalidation rows are available. */
    invalidations: boolean
  }
  /** Missing base features that prevent reliable `sysio.msig` use. */
  missingRequired: string[]
  /** Missing chunked-v2 features; legacy contracts are expected to report these. */
  missingEnhanced: string[]
}

/** Approval table result, preferring modern approvals and falling back to legacy rows. */
export type MsigApprovalsResult =
  | {
      /** Modern approvals table result. */
      kind: "approvals2"
      /** Modern approval row. */
      approvals: MsigApprovalsInfo
    }
  | {
      /** Legacy approvals table result. */
      kind: "legacy"
      /** Legacy approval row. */
      approvals: MsigOldApprovalsInfo
    }

/** Proposal hash verification state. */
export type ProposalHashStatus = "verified" | "mismatch" | "unavailable"

/** Reason proposal hash verification is unavailable. */
export type ProposalHashUnavailableReason =
  | "missing-packed-transaction"
  | "missing-expected-hash"
  | "profile-does-not-support-hash"

/** Result of verifying proposal bytes against `trx_hash`. */
export interface ProposalHashVerification {
  /** Verification status. */
  status: ProposalHashStatus
  /** Actual hash of available packed transaction bytes. */
  actual: Checksum256 | null
  /** Expected hash from the proposal row or read-only result. */
  expected: Checksum256 | null
  /** Whether the actual and expected hashes match. */
  matches: boolean | null
  /** Why verification is unavailable. */
  reason: ProposalHashUnavailableReason | null
}

/** Feature flags carried with proposal details. */
export interface ProposalDetailFeatures {
  /** Whether read-only `getproposal` is available. */
  readOnlyGetProposal: boolean
  /** Whether legacy proposal table reads are available. */
  legacyTableRead: boolean
  /** Whether chunked proposal storage is available. */
  chunkedProposals: boolean
  /** Whether proposal hash metadata is available. */
  proposalHash: boolean
  /** Whether approval actions accept proposal hashes. */
  approveProposalHash: boolean
}

/** Fully shaped proposal detail for UI and service consumers. */
export interface ProposalDetail {
  /** Proposal creator. */
  proposer: string
  /** Proposal name. */
  proposalName: string
  /** Detected contract profile. */
  profile: MsigProfile
  /** Read strategy used for this detail. */
  readStrategy: MsigReadStrategy
  /** Feature flags from the detected contract profile. */
  features: ProposalDetailFeatures
  /** Raw proposal row or read-only proposal return. */
  proposal: MsigProposal
  /** Unpacked inner transaction, when available and decodable. */
  transaction: Transaction | null
  /** Proposal hash verification result. */
  hash: ProposalHashVerification
  /** Approval information, when found. */
  approvals: MsigApprovalsResult | null
  /** Invalidation rows, when loaded by a consumer. */
  invalidations: MsigInvalidation[] | null
  /** Approval-list status summary. */
  status: ProposalStatus
}

/** Approval-list status summary for a proposal. */
export interface ProposalStatus {
  /** Requested permission levels. */
  requested: string[]
  /** Provided permission levels. */
  provided: string[]
  /** Requested permission levels still missing. */
  outstanding: string[]
  /** Whether all requested approvals have been provided. */
  isFullyApprovedByRequestedList: boolean
  /** Whether the inner transaction is expired. */
  isExpired: boolean | null
  /** Earliest execution time, when present. */
  earliestExecTime: string | null
  /** Whether approval-list state suggests the proposal can execute. */
  canExecuteByRequestedList: boolean
  /** Caveat describing status limitations. */
  caveat: string | null
}

/** JSON row shape generated from `sysio.msig::proposal`. */
export type SysioMsigProposalRow = SysioContracts.SysioMsigProposalType

/** JSON row shape generated from `sysio.msig::propchunk`. */
export type SysioMsigPropchunkRow = SysioContracts.SysioMsigPropchunkType
