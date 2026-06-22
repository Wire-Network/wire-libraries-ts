import { match } from "ts-pattern"

import { Checksum256 } from "../chain/Checksum.js"

import type { MsigProposal } from "./Structs.js"
import type { MsigCapabilities, ProposalHashVerification } from "./Types.js"

function checksumOrNull(value: Checksum256 | null | undefined): Checksum256 | null {
  return value ? Checksum256.from(value) : null
}

function numberFromOptionalUInt32(value: unknown): number {
  if (value === null || value === undefined) {
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

/** Returns the packed transaction byte size on a proposal row or return value. */
export function getProposalPackedTransactionSize(proposal: MsigProposal): number {
  return proposal.packed_transaction ? proposal.packed_transaction.array.length : 0
}

/** Returns true when a proposal row points at chunked storage. */
export function isChunkedProposal(proposal: MsigProposal): boolean {
  return numberFromOptionalUInt32(proposal.chunk_count) > 0
}

/** Hashes the proposal packed transaction bytes when they are available. */
export function hashProposalPackedTransaction(
  proposal: MsigProposal
): Checksum256 | null {
  if (getProposalPackedTransactionSize(proposal) === 0) {
    return null
  }

  return Checksum256.hash(proposal.packed_transaction)
}

/** Verifies packed proposal bytes against the chunked-v2 `trx_hash` field. */
export function verifyProposalHash(
  proposal: MsigProposal,
  capabilities?: MsigCapabilities
): ProposalHashVerification {
  const actual = hashProposalPackedTransaction(proposal),
    expected = checksumOrNull(proposal.trx_hash)

  return match({
    profileSupportsHash: capabilities ? capabilities.supports.proposalHash : true,
    hasActual: !!actual,
    hasExpected: !!expected
  })
    .with({ profileSupportsHash: false }, () => ({
      status: "unavailable" as const,
      actual,
      expected,
      matches: null,
      reason: "profile-does-not-support-hash" as const
    }))
    .with({ hasActual: false }, () => ({
      status: "unavailable" as const,
      actual,
      expected,
      matches: null,
      reason: "missing-packed-transaction" as const
    }))
    .with({ hasExpected: false }, () => ({
      status: "unavailable" as const,
      actual,
      expected,
      matches: null,
      reason: "missing-expected-hash" as const
    }))
    .otherwise(() => ({
      status: actual!.equals(expected!) ? "verified" : "mismatch",
      actual,
      expected,
      matches: actual!.equals(expected!)
    }))
}
