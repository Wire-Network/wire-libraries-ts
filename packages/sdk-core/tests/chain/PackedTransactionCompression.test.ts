import pako from "pako"

import { TrxVariant } from "@wireio/sdk-core/api/v1/Types"
import { Bytes } from "@wireio/sdk-core/chain/Bytes"
import {
  CompressionType,
  PackedTransaction
} from "@wireio/sdk-core/chain/Transaction"
import {
  inflatePackedTransaction,
  PackedTransactionCompression
} from "@wireio/sdk-core/chain/PackedTransactionCompression"
import { Serializer } from "@wireio/sdk-core/serializer"
import {
  createEmptySignedTransaction,
  createEmptyTransaction
} from "../support/transactions.js"

const ApiPackedTransactionCompression = {
  zlib: "zlib"
} as const

const InflateLimitMessage = /Packed transaction zlib output exceeds/
const InflateFailureMessage = /Unable to inflate packed transaction/
const InvalidLimitMessage = /non-negative safe integer/

function deflate(bytes: Uint8Array): Uint8Array {
  return pako.deflate(bytes) as Uint8Array
}

function truncateLastByte(bytes: Uint8Array): Uint8Array {
  return bytes.subarray(0, bytes.byteLength - 1)
}

function createOversizedDeflatedBytes(): Uint8Array {
  return deflate(
    new Uint8Array(PackedTransactionCompression.DefaultMaxInflatedBytes + 1)
  )
}

describe("packed transaction zlib inflation", () => {
  test("inflates compressed packed transaction bytes", () => {
    const encoded = Serializer.encode({ object: createEmptyTransaction() }),
      inflated = inflatePackedTransaction(deflate(encoded.array))

    expect(inflated.equals(encoded)).toBe(true)
  })

  test("rejects helper output above the configured byte limit", () => {
    const compressed = deflate(new Uint8Array([1, 2, 3, 4]))

    expect(() =>
      inflatePackedTransaction(compressed, { maxInflatedBytes: 3 })
    ).toThrow(InflateLimitMessage)
  })

  test("rejects truncated zlib streams before ABI decode", () => {
    const encoded = Serializer.encode({ object: createEmptyTransaction() }),
      truncated = truncateLastByte(deflate(encoded.array))

    expect(() => inflatePackedTransaction(truncated)).toThrow(
      InflateFailureMessage
    )
  })

  test.each([Number.NaN, -1, 1.5])(
    "rejects invalid maxInflatedBytes value %s",
    maxInflatedBytes => {
      expect(() =>
        inflatePackedTransaction(new Uint8Array(), { maxInflatedBytes })
      ).toThrow(InvalidLimitMessage)
    }
  )
})

describe("PackedTransaction.getTransaction", () => {
  test("decodes zlib-compressed transactions", () => {
    const signedTransaction = createEmptySignedTransaction(),
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

  test("honors custom zlib inflate limits", () => {
    const signedTransaction = createEmptySignedTransaction(),
      packedTransaction = PackedTransaction.fromSigned(
        signedTransaction,
        CompressionType.zlib
      )

    expect(() =>
      packedTransaction.getTransaction({ maxInflatedBytes: 1 })
    ).toThrow(InflateLimitMessage)
  })
})

describe("TrxVariant.transaction", () => {
  test("decodes zlib-compressed transactions", () => {
    const transaction = createEmptyTransaction(),
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

  test("honors custom zlib inflate limits", () => {
    const transaction = createEmptyTransaction(),
      packedTrx = Bytes.from(
        deflate(Serializer.encode({ object: transaction }).array)
      ),
      trxVariant = TrxVariant.from({
        id: transaction.id,
        compression: ApiPackedTransactionCompression.zlib,
        packed_trx: packedTrx.hexString
      })

    expect(() => trxVariant.getTransaction({ maxInflatedBytes: 1 })).toThrow(
      InflateLimitMessage
    )
  })
})
