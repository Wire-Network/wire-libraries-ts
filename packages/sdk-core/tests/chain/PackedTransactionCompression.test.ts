import pako from "pako"

import { TrxVariant } from "@wireio/sdk-core/api/v1/Types"
import { Bytes } from "@wireio/sdk-core/chain/Bytes"
import {
  CompressionType,
  PackedTransaction,
  SignedTransaction,
  Transaction
} from "@wireio/sdk-core/chain/Transaction"
import {
  inflatePackedTransaction,
  PackedTransactionCompression
} from "@wireio/sdk-core/chain/PackedTransactionCompression"
import { Serializer } from "@wireio/sdk-core/serializer"

const ApiPackedTransactionCompression = {
  zlib: "zlib"
} as const

const InflateLimitMessage = /Packed transaction zlib output exceeds/

function createTransaction(): Transaction {
  return Transaction.from({
    expiration: "1970-01-01T00:00:00.000",
    ref_block_num: 0,
    ref_block_prefix: 0,
    context_free_actions: [],
    actions: [],
    transaction_extensions: []
  })
}

function createSignedTransaction(): SignedTransaction {
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

function deflate(bytes: Uint8Array): Uint8Array {
  return pako.deflate(bytes) as Uint8Array
}

function createOversizedDeflatedBytes(): Uint8Array {
  return deflate(
    new Uint8Array(PackedTransactionCompression.DefaultMaxInflatedBytes + 1)
  )
}

describe("packed transaction zlib inflation", () => {
  test("inflates compressed packed transaction bytes", () => {
    const encoded = Serializer.encode({ object: createTransaction() }),
      inflated = inflatePackedTransaction(deflate(encoded.array))

    expect(inflated.equals(encoded)).toBe(true)
  })

  test("rejects helper output above the configured byte limit", () => {
    const compressed = deflate(new Uint8Array([1, 2, 3, 4]))

    expect(() =>
      inflatePackedTransaction(compressed, { maxInflatedBytes: 3 })
    ).toThrow(InflateLimitMessage)
  })
})

describe("PackedTransaction.getTransaction", () => {
  test("decodes zlib-compressed transactions", () => {
    const signedTransaction = createSignedTransaction(),
      packedTransaction = PackedTransaction.fromSigned(
        signedTransaction,
        CompressionType.zlib
      )

    expect(
      packedTransaction.getTransaction().equals(signedTransaction.transaction)
    ).toBe(true)
  })

  test("rejects oversized zlib-compressed transactions before ABI decode", () => {
    const packedTransaction = PackedTransaction.from({
      compression: CompressionType.zlib,
      packed_trx: createOversizedDeflatedBytes()
    })

    expect(() => packedTransaction.getTransaction()).toThrow(
      InflateLimitMessage
    )
  })
})

describe("TrxVariant.transaction", () => {
  test("decodes zlib-compressed transactions", () => {
    const transaction = createTransaction(),
      packedTrx = Bytes.from(
        deflate(Serializer.encode({ object: transaction }).array)
      ),
      trxVariant = TrxVariant.from({
        id: transaction.id,
        compression: ApiPackedTransactionCompression.zlib,
        packed_trx: packedTrx.hexString
      })

    expect(trxVariant.transaction!.equals(transaction)).toBe(true)
  })

  test("rejects oversized zlib-compressed transactions before ABI decode", () => {
    const trxVariant = TrxVariant.from({
      id: "0".repeat(64),
      compression: ApiPackedTransactionCompression.zlib,
      packed_trx: Bytes.from(createOversizedDeflatedBytes()).hexString
    })

    expect(() => trxVariant.transaction).toThrow(InflateLimitMessage)
  })
})
