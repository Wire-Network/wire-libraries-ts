import { getBigInt, getBytes, isBytesLike, toUtf8Bytes } from "ethers"

import type {
  EthereumReserveCreateRequest,
  ReserveCreateDefinition,
  ReserveSwapRequest
} from "./Types.js"

const MaximumUnsigned64 = 18_446_744_073_709_551_615n,
  MinimumReserveValue = 1n,
  MinimumConnectorWeightBps = 1,
  MaximumConnectorWeightBps = 9999,
  MinimumToleranceBps = 0,
  MaximumToleranceBps = 10_000,
  MaximumReserveNameBytes = 64,
  MaximumReserveDescriptionBytes = 256,
  CompressedSecp256k1PublicKeyBytes = 33,
  CompressedSecp256k1PublicKeyPrefix = {
    even: 2,
    odd: 3
  } as const,
  InvalidCompressedSecp256k1PublicKeyMessage =
    "creatorPubKey must be a 33-byte compressed secp256k1 public key."

/** Validate one value against the positive unsigned 64-bit protocol boundary. */
export function assertReserveUnsigned64(
  value: ReserveSwapRequest["sourceTokenCode"],
  field: string
): bigint {
  let parsed: bigint
  try {
    parsed = getBigInt(value)
  } catch (error: unknown) {
    throw new Error(`${field} must be an integer.`, { cause: error })
  }
  if (parsed < MinimumReserveValue || parsed > MaximumUnsigned64) {
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

  let externalTokenAmount: bigint
  try {
    externalTokenAmount = getBigInt(definition.externalTokenAmount)
  } catch (error: unknown) {
    throw new Error("externalTokenAmount must be an integer.", { cause: error })
  }
  if (externalTokenAmount < MinimumReserveValue) {
    throw new Error("externalTokenAmount must be greater than zero.")
  }

  assertReserveUnsigned64(definition.requestedWireAmount, "requestedWireAmount")
  if (
    !Number.isInteger(definition.connectorWeightBps) ||
    definition.connectorWeightBps < MinimumConnectorWeightBps ||
    definition.connectorWeightBps > MaximumConnectorWeightBps
  ) {
    throw new Error(
      `connectorWeightBps must be an integer from ${MinimumConnectorWeightBps} to ${MaximumConnectorWeightBps}.`
    )
  }

  const nameBytes = toUtf8Bytes(definition.name).length
  if (nameBytes === 0 || nameBytes > MaximumReserveNameBytes) {
    throw new Error(
      `name must contain 1 to ${MaximumReserveNameBytes} UTF-8 bytes.`
    )
  }

  const descriptionBytes = toUtf8Bytes(definition.description).length
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
  if (!isBytesLike(request.creatorPubKey)) {
    throw new Error(InvalidCompressedSecp256k1PublicKeyMessage)
  }
  const creatorPublicKey = getBytes(request.creatorPubKey)
  if (
    creatorPublicKey.length !== CompressedSecp256k1PublicKeyBytes ||
    (creatorPublicKey[0] !== CompressedSecp256k1PublicKeyPrefix.even &&
      creatorPublicKey[0] !== CompressedSecp256k1PublicKeyPrefix.odd)
  ) {
    throw new Error(InvalidCompressedSecp256k1PublicKeyMessage)
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
  if (getBytes(request.targetRecipient).length === 0) {
    throw new Error("targetRecipient is required.")
  }
}
