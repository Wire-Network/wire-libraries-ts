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

/** Unpacks the inner transaction from a proposal with available packed bytes. */
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
  }).getTransaction()
}

/** Attempts to unpack a proposal transaction and returns null on decode failure. */
export function tryUnpackProposalTransaction(
  proposal: MsigProposal
): Transaction | null {
  try {
    return unpackProposalTransaction(proposal)
  } catch {
    return null
  }
}

/** Creates the UI-neutral proposal detail shape returned by `MsigClient`. */
export function createProposalDetail(args: {
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
}): ProposalDetail {
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
