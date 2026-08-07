import { BigNumber, utils as ethersUtils } from "ethers"

import type { ReserveSwapRequest } from "./Types.js"

const MaximumUnsigned64 = BigNumber.from("18446744073709551615"),
  MinimumReserveValue = BigNumber.from(1),
  MinimumToleranceBps = 0,
  MaximumToleranceBps = 10_000

/** Validate one value against the positive unsigned 64-bit protocol boundary. */
export function assertReserveUnsigned64(
  value: ReserveSwapRequest["sourceTokenCode"],
  field: string
): BigNumber {
  let parsed: BigNumber
  try {
    parsed = BigNumber.from(value)
  } catch (error: unknown) {
    throw new Error(`${field} must be an integer.`, { cause: error })
  }
  if (parsed.lt(MinimumReserveValue) || parsed.gt(MaximumUnsigned64)) {
    throw new Error(`${field} must be between 1 and uint64 max.`)
  }
  return parsed
}

/** Validate portable reserve-swap fields before opening a wallet prompt. */
export function assertReserveSwapRequest(request: ReserveSwapRequest): void {
  assertReserveUnsigned64(request.sourceTokenCode, "sourceTokenCode")
  assertReserveUnsigned64(request.sourceReserveCode, "sourceReserveCode")
  assertReserveUnsigned64(request.sourceAmount, "sourceAmount")
  assertReserveUnsigned64(request.targetChainCode, "targetChainCode")
  assertReserveUnsigned64(request.targetTokenCode, "targetTokenCode")
  assertReserveUnsigned64(request.targetReserveCode, "targetReserveCode")
  assertReserveUnsigned64(request.targetAmount, "targetAmount")

  if (
    !Number.isInteger(request.targetToleranceBps) ||
    request.targetToleranceBps < MinimumToleranceBps ||
    request.targetToleranceBps > MaximumToleranceBps
  ) {
    throw new Error(
      `targetToleranceBps must be between ${MinimumToleranceBps} and ${MaximumToleranceBps}.`
    )
  }
  if (ethersUtils.arrayify(request.targetRecipient).length === 0) {
    throw new Error("targetRecipient is required.")
  }
}
