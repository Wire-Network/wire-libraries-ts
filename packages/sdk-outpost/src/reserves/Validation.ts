import { BigNumber, utils as ethersUtils } from "ethers"

import {
  MAX_CONNECTOR_WEIGHT_BPS,
  MIN_CONNECTOR_WEIGHT_BPS
} from "@wireio/sdk-core/contracts/sysio/reserv/Constants"

import type {
  EthereumReserveCreateRequest,
  ReserveCreateDefinition,
  ReserveSwapRequest
} from "./Types.js"

const MaximumUnsigned64 = BigNumber.from("18446744073709551615"),
  MinimumReserveValue = BigNumber.from(1),
  MinimumToleranceBps = 0,
  MaximumToleranceBps = 10_000,
  MaximumReserveNameBytes = 64,
  MaximumReserveDescriptionBytes = 256,
  CompressedSecp256k1PublicKeyBytes = 33

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

/** Validate portable reserve-creation fields before opening a wallet prompt. */
export function assertReserveCreateDefinition(
  definition: ReserveCreateDefinition
): void {
  assertReserveUnsigned64(definition.tokenCode, "tokenCode")
  assertReserveUnsigned64(definition.reserveCode, "reserveCode")

  let externalTokenAmount: BigNumber
  try {
    externalTokenAmount = BigNumber.from(definition.externalTokenAmount)
  } catch (error: unknown) {
    throw new Error("externalTokenAmount must be an integer.", { cause: error })
  }
  if (externalTokenAmount.lt(MinimumReserveValue)) {
    throw new Error("externalTokenAmount must be greater than zero.")
  }

  assertReserveUnsigned64(
    definition.requestedWireAmount,
    "requestedWireAmount"
  )
  if (
    !Number.isInteger(definition.connectorWeightBps) ||
    definition.connectorWeightBps < MIN_CONNECTOR_WEIGHT_BPS ||
    definition.connectorWeightBps > MAX_CONNECTOR_WEIGHT_BPS
  ) {
    throw new Error(
      `connectorWeightBps must be an integer from ${MIN_CONNECTOR_WEIGHT_BPS} to ${MAX_CONNECTOR_WEIGHT_BPS}.`
    )
  }

  const nameBytes = ethersUtils.toUtf8Bytes(definition.name).length
  if (nameBytes === 0 || nameBytes > MaximumReserveNameBytes) {
    throw new Error(
      `name must contain 1 to ${MaximumReserveNameBytes} UTF-8 bytes.`
    )
  }

  const descriptionBytes = ethersUtils.toUtf8Bytes(
    definition.description
  ).length
  if (descriptionBytes > MaximumReserveDescriptionBytes) {
    throw new Error(
      `description must contain at most ${MaximumReserveDescriptionBytes} UTF-8 bytes.`
    )
  }
}

/** Validate Ethereum-specific reserve creation fields. */
export function assertEthereumReserveCreateRequest(
  request: EthereumReserveCreateRequest
): void {
  assertReserveCreateDefinition(request)
  if (
    ethersUtils.arrayify(request.creatorPubKey).length !==
    CompressedSecp256k1PublicKeyBytes
  ) {
    throw new Error(
      "creatorPubKey must be a 33-byte compressed secp256k1 public key."
    )
  }
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
