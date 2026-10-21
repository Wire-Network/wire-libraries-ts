import { DesyndicateLIQ } from "@wireio/opp-typescript-models"
import { Bytes } from "../../../chain/Bytes.js"
import {
  SysioMsgchAttestationtype,
  type SysioMsgchQueueoutAction
} from "../../../types/SysioContractTypes.js"
import { chainSlugValue } from "../chains/Slug.js"

/**
 * Decode a DESYNDICATE_LIQ payload from ABI-decoded sysio.msgch::queueout data.
 * Uses the producer model; IDs/codes/amounts remain bigint and the recipient
 * remains its native public-key bytes. Throws for invalid type, payload,
 * correlation fields or a destination differing from the outer action.
 * This decodes a request, not its execution or payout. Callers must verify the
 * canonical transaction, inline ancestry and matching outpost payment separately.
 */
export function decodeDesyndicateLIQ(
  action: SysioMsgchQueueoutAction
): DesyndicateLIQ {
  const attestation =
    typeof action.attest_type === "string"
      ? SysioMsgchAttestationtype[action.attest_type]
      : action.attest_type
  if (
    attestation !== SysioMsgchAttestationtype.ATTESTATION_TYPE_DESYNDICATE_LIQ
  ) {
    throw new Error("Expected a DESYNDICATE_LIQ queueout action")
  }

  const request = DesyndicateLIQ.fromBinary(Bytes.from(action.data).array)
  if (request.chainCode !== BigInt(chainSlugValue(action.chain_code))) {
    throw new Error("Desyndication destination does not match queueout")
  }
  if (
    !request.user?.address.length ||
    !request.amount ||
    request.amount.tokenCode <= 0n ||
    request.amount.amount <= 0n ||
    request.requestId <= 0n
  ) {
    throw new Error(
      "Desyndication recipient, amount or request ID is missing or invalid"
    )
  }
  return request
}
