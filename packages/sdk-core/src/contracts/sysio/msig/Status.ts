import { match } from "ts-pattern"

import type { Transaction } from "../../../chain/Transaction.js"

import type {
  MsigApproval,
  MsigApprovalsInfo,
  MsigOldApprovalsInfo,
  MsigProposal
} from "./Structs.js"
import type { MsigApprovalsResult, ProposalStatus } from "./Types.js"

function approvalLevelToString(approval: MsigApproval): string {
  return approval.level.toString()
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

function getEarliestExecTime(proposal: MsigProposal): string | null {
  return proposal.earliest_exec_time
    ? proposal.earliest_exec_time.toString()
    : null
}

function getModernApprovalLists(approvals: MsigApprovalsInfo): {
  requested: string[]
  provided: string[]
} {
  return {
    requested: unique(approvals.requested_approvals.map(approvalLevelToString)),
    provided: unique(approvals.provided_approvals.map(approvalLevelToString))
  }
}

function getLegacyApprovalLists(approvals: MsigOldApprovalsInfo): {
  requested: string[]
  provided: string[]
} {
  return {
    requested: unique(approvals.requested_approvals.map(level => level.toString())),
    provided: unique(approvals.provided_approvals.map(level => level.toString()))
  }
}

function getApprovalLists(approvals: MsigApprovalsResult | null): {
  requested: string[]
  provided: string[]
} {
  if (!approvals) {
    return { requested: [], provided: [] }
  }

  return match(approvals)
    .with({ kind: "approvals2" }, result =>
      getModernApprovalLists(result.approvals)
    )
    .with({ kind: "legacy" }, result => getLegacyApprovalLists(result.approvals))
    .exhaustive()
}

function isTransactionExpired(
  transaction: Transaction | null,
  now = new Date()
): boolean | null {
  if (!transaction) {
    return null
  }

  const expiration = new Date(transaction.expiration.toString())

  if (Number.isNaN(expiration.getTime())) {
    return null
  }

  return expiration.getTime() <= now.getTime()
}

/** Builds approval-list status for a proposal detail. */
export function getProposalStatus(args: {
  /** Proposal row or read-only return value. */
  proposal: MsigProposal
  /** Approval row, when available. */
  approvals: MsigApprovalsResult | null
  /** Decoded inner transaction, when available. */
  transaction?: Transaction | null
  /** Current time override for tests. */
  now?: Date
}): ProposalStatus {
  const lists = getApprovalLists(args.approvals),
    providedSet = new Set(lists.provided),
    outstanding = lists.requested.filter(level => !providedSet.has(level)),
    isExpired = isTransactionExpired(args.transaction || null, args.now),
    earliestExecTime = getEarliestExecTime(args.proposal),
    isFullyApprovedByRequestedList =
      lists.provided.length > 0 && outstanding.length === 0

  return {
    requested: lists.requested,
    provided: lists.provided,
    outstanding,
    isFullyApprovedByRequestedList,
    isExpired,
    earliestExecTime,
    canExecuteByRequestedList:
      isFullyApprovedByRequestedList &&
      isExpired !== true &&
      earliestExecTime === null,
    caveat:
      "This status is based on msig approval lists only. Full execution readiness also depends on current account authorities, invalidations, delay state, and chain authorization checks."
  }
}
