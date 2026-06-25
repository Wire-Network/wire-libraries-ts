import { Bytes } from "../../../chain/Bytes.js"
import { Checksum256 } from "../../../chain/Checksum.js"
import { UInt32, UInt8 } from "../../../chain/Integer.js"
import { Name } from "../../../chain/Name.js"
import { PermissionLevel } from "../../../chain/PermissionLevel.js"
import { Struct } from "../../../chain/Struct.js"
import { TimePoint } from "../../../chain/Time.js"
import { Transaction } from "../../../chain/Transaction.js"

/** Runtime serializer for `sysio.msig::approval`. */
@Struct.type("approval")
export class MsigApproval extends Struct {
  /** Approved permission level. */
  @Struct.field(PermissionLevel) declare level: PermissionLevel

  /** Chain time when the approval was recorded. */
  @Struct.field("time_point") declare time: TimePoint
}

/** Runtime serializer for the current `sysio.msig::approvals_info` table row. */
@Struct.type("approvals_info")
export class MsigApprovalsInfo extends Struct {
  /** Table row version. */
  @Struct.field("uint8") declare version: UInt8

  /** Proposal name that owns the approval lists. */
  @Struct.field("name") declare proposal_name: Name

  /** Permission levels still requested by the proposal. */
  @Struct.field(MsigApproval, { array: true })
  declare requested_approvals: MsigApproval[]

  /** Permission levels already provided to the proposal. */
  @Struct.field(MsigApproval, { array: true })
  declare provided_approvals: MsigApproval[]
}

/** Runtime serializer for legacy `sysio.msig::old_approvals_info` rows. */
@Struct.type("old_approvals_info")
export class MsigOldApprovalsInfo extends Struct {
  /** Proposal name that owns the approval lists. */
  @Struct.field("name") declare proposal_name: Name

  /** Legacy requested permission levels. */
  @Struct.field(PermissionLevel, { array: true })
  declare requested_approvals: PermissionLevel[]

  /** Legacy provided permission levels. */
  @Struct.field(PermissionLevel, { array: true })
  declare provided_approvals: PermissionLevel[]
}

/** Runtime serializer for `sysio.msig::proposal` rows and read-only returns. */
@Struct.type("proposal")
export class MsigProposal extends Struct {
  /** Proposal name. */
  @Struct.field("name") declare proposal_name: Name

  /** Packed inner transaction, empty for chunked parent rows. */
  @Struct.field("bytes") declare packed_transaction: Bytes

  /** Optional earliest execution time. */
  @Struct.field("time_point", { optional: true, extension: true })
  declare earliest_exec_time: TimePoint | null

  /** Chunk count used by chunked-v2 proposal parent rows. */
  @Struct.field("uint32", { extension: true })
  declare chunk_count: UInt32 | null

  /** Total assembled packed transaction size for chunked-v2 proposals. */
  @Struct.field("uint32", { extension: true })
  declare total_size: UInt32 | null

  /** Expected SHA-256 hash of the packed transaction for chunked-v2 proposals. */
  @Struct.field("checksum256", { extension: true })
  declare trx_hash: Checksum256 | null
}

/** Runtime serializer for `sysio.msig::propchunk` rows. */
@Struct.type("propchunk")
export class MsigPropChunk extends Struct {
  /** Proposal name this chunk belongs to. */
  @Struct.field("name") declare proposal_name: Name

  /** Zero-based chunk index. */
  @Struct.field("uint32") declare chunk_index: UInt32

  /** Raw packed transaction chunk bytes. */
  @Struct.field("bytes") declare data: Bytes
}

/** Runtime serializer for `sysio.msig::invalidation` rows. */
@Struct.type("invalidation")
export class MsigInvalidation extends Struct {
  /** Account that invalidated prior approvals. */
  @Struct.field("name") declare account: Name

  /** Last invalidation time for the account. */
  @Struct.field("time_point") declare last_invalidation_time: TimePoint
}

/** Runtime serializer for `sysio.msig::propose`. */
@Struct.type("propose")
export class MsigPropose extends Struct {
  /** Account proposing the inner transaction. */
  @Struct.field("name") declare proposer: Name

  /** Proposal name. */
  @Struct.field("name") declare proposal_name: Name

  /** Requested approver permission levels. */
  @Struct.field(PermissionLevel, { array: true })
  declare requested: PermissionLevel[]

  /** Inner transaction to execute when approved. */
  @Struct.field(Transaction) declare trx: Transaction
}

/** Runtime serializer for `sysio.msig::approve`. */
@Struct.type("approve")
export class MsigApprove extends Struct {
  /** Account that created the proposal. */
  @Struct.field("name") declare proposer: Name

  /** Proposal name. */
  @Struct.field("name") declare proposal_name: Name

  /** Approving permission level. */
  @Struct.field(PermissionLevel) declare level: PermissionLevel

  /** Optional proposal hash extension used by chunked-v2 contracts. */
  @Struct.field("checksum256", { extension: true })
  declare proposal_hash: Checksum256 | null
}

/** Runtime serializer for `sysio.msig::unapprove`. */
@Struct.type("unapprove")
export class MsigUnapprove extends Struct {
  /** Account that created the proposal. */
  @Struct.field("name") declare proposer: Name

  /** Proposal name. */
  @Struct.field("name") declare proposal_name: Name

  /** Permission level removing its approval. */
  @Struct.field(PermissionLevel) declare level: PermissionLevel
}

/** Runtime serializer for `sysio.msig::cancel`. */
@Struct.type("cancel")
export class MsigCancel extends Struct {
  /** Account that created the proposal. */
  @Struct.field("name") declare proposer: Name

  /** Proposal name. */
  @Struct.field("name") declare proposal_name: Name

  /** Account canceling the proposal. */
  @Struct.field("name") declare canceler: Name
}

/** Runtime serializer for `sysio.msig::exec`. */
@Struct.type("exec")
export class MsigExec extends Struct {
  /** Account that created the proposal. */
  @Struct.field("name") declare proposer: Name

  /** Proposal name. */
  @Struct.field("name") declare proposal_name: Name

  /** Account executing the proposal. */
  @Struct.field("name") declare executer: Name
}

/** Runtime serializer for `sysio.msig::invalidate`. */
@Struct.type("invalidate")
export class MsigInvalidate extends Struct {
  /** Account invalidating its existing approvals. */
  @Struct.field("name") declare account: Name
}

/** Runtime serializer for read-only `sysio.msig::getproposal`. */
@Struct.type("getproposal")
export class MsigGetProposal extends Struct {
  /** Account that created the proposal. */
  @Struct.field("name") declare proposer: Name

  /** Proposal name. */
  @Struct.field("name") declare proposal_name: Name
}
