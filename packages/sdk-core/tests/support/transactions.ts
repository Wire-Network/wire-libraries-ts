import {
  SignedTransaction,
  Transaction
} from "@wireio/sdk-core/chain/Transaction"
import { Serializer } from "@wireio/sdk-core/serializer"
import { concatBytes } from "@wireio/sdk-core/Utils"

/**
 * Offset of each varuint32 in an encoded {@link createEmptyTransaction}. Each follows the 10 fixed
 * header bytes and is the single byte `00`.
 */
export const EmptyTransactionVaruint32Offsets: [string, number][] = [
  ["max_net_usage_words", 10],
  ["delay_sec", 12],
  ["context_free_actions length", 13],
  ["actions length", 14],
  ["transaction_extensions length", 15]
]

/** Encode an empty transaction fixture. */
export function encodeEmptyTransaction(): Uint8Array {
  return Serializer.encode({ object: createEmptyTransaction() }).array
}

/** Copy `bytes` with the single byte at `offset` replaced by `replacement`. */
export function replaceByte(
  bytes: Uint8Array,
  offset: number,
  replacement: Uint8Array
): Uint8Array {
  return concatBytes(
    bytes.subarray(0, offset),
    replacement,
    bytes.subarray(offset + 1)
  )
}

/** Create an empty transaction fixture for sdk-core tests. */
export function createEmptyTransaction(): Transaction {
  return Transaction.from({
    expiration: "1970-01-01T00:00:00.000",
    ref_block_num: 0,
    ref_block_prefix: 0,
    context_free_actions: [],
    actions: [],
    transaction_extensions: []
  })
}

/** Create an empty signed transaction fixture for sdk-core tests. */
export function createEmptySignedTransaction(): SignedTransaction {
  return SignedTransaction.from({
    expiration: "1970-01-01T00:00:00.000",
    ref_block_num: 0,
    ref_block_prefix: 0,
    context_free_actions: [],
    actions: [],
    transaction_extensions: [],
    signatures: [],
    context_free_data: []
  })
}
