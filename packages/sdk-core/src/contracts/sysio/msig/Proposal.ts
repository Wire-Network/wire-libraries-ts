import { getLogger } from "@wireio/shared"

import { CompressionType, PackedTransaction, Transaction } from "../../../chain/Transaction.js"

import { verifyProposalHash } from "./Hash.js"
import type { MsigProposal } from "./Structs.js"
import { getProposalStatus } from "./Status.js"
import type {
  MsigApprovalsResult,
  MsigCapabilities,
  MsigReadStrategy,
  ProposalDetail
} from "./Types.js"

/** Match the filename-derived category without depending on CommonJS globals. */
const LogCategory = "contracts:sysio:msig:Proposal"
const log = getLogger(LogCategory)

/** Logged when a proposal's transaction cannot be unpacked; takes the proposal name and the error. */
const UNPACK_FAILED_LOG_MESSAGE = "Multisig proposal %s transaction did not unpack: %s"

/** Inputs for {@link createProposalDetail}. */
export interface CreateProposalDetailOptions {
  /** Account that created the proposal. */
  proposer: string
  /** Proposal row or read-only return value. */
  proposal: MsigProposal
  /** Approval row, when available. */
  approvals: MsigApprovalsResult | null
  /** ABI-derived contract capabilities. */
  capabilities: MsigCapabilities | null
  /** Read strategy used to retrieve this proposal. */
  readStrategy: MsigReadStrategy | null
}

/**
 * Unpacks the inner transaction from a proposal with available packed bytes. Only the canonical
 * encoding is accepted, as `sysio.msig` executes nothing else.
 */
export function unpackProposalTransaction(proposal: MsigProposal): Transaction {
  if (
    !proposal.packed_transaction ||
    proposal.packed_transaction.array.length === 0
  ) {
    throw new Error("Cannot unpack proposal without packed_transaction bytes.")
  }

  return PackedTransaction.from({
    compression: CompressionType.none,
    packed_context_free_data: "",
    packed_trx: proposal.packed_transaction,
    signatures: []
  }).getTransaction({ canonical: true })
}

/**
 * Attempts to unpack a proposal transaction. Returns null, and logs a warning with the reason, when
 * the bytes are missing, do not decode, or are not canonically encoded.
 */
export function tryUnpackProposalTransaction(
  proposal: MsigProposal
): Transaction {
  try {
    return unpackProposalTransaction(proposal)
  } catch (error) {
    log.warn(
      UNPACK_FAILED_LOG_MESSAGE,
      proposal.proposal_name.toString(),
      String(error)
    )
    return null
  }
}

/** Creates the UI-neutral proposal detail shape returned by `MsigClient`. */
export function createProposalDetail(
  args: CreateProposalDetailOptions
): ProposalDetail {
  const transaction = tryUnpackProposalTransaction(args.proposal),
    features = {
      readOnlyGetProposal: args.capabilities?.supports.readOnlyGetProposal || false,
      legacyTableRead: args.capabilities?.supports.legacyTableRead || false,
      chunkedProposals: args.capabilities?.supports.chunkedProposals || false,
      proposalHash: args.capabilities?.supports.proposalHash || false,
      approveProposalHash: args.capabilities?.supports.approveProposalHash || false
    }

  return {
    proposer: args.proposer,
    proposalName: args.proposal.proposal_name.toString(),
    profile: args.capabilities?.profile || "unknown",
    readStrategy:
      args.readStrategy || args.capabilities?.readStrategy || "legacy-table",
    features,
    proposal: args.proposal,
    transaction,
    hash: verifyProposalHash(args.proposal, args.capabilities),
    approvals: args.approvals,
    invalidations: null,
    status: getProposalStatus({
      proposal: args.proposal,
      approvals: args.approvals,
      transaction
    })
  }
}
