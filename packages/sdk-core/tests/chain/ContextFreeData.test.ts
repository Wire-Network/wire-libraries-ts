import { createHash } from "node:crypto"
import pako from "pako"
import {
  Bytes,
  CompressionType,
  PackedTransaction,
  SignedTransaction
} from "@wireio/sdk-core"
import { createEmptySignedTransaction } from "../support/transactions.js"

const ChainId = "11".repeat(32)

describe("transaction context-free data", () => {
  it.each([CompressionType.none, CompressionType.zlib])(
    "round-trips context-free data with compression %s",
    compression => {
      const transaction = SignedTransaction.from({
          ...createEmptySignedTransaction(),
          context_free_data: ["010203", ""]
        }),
        packed = PackedTransaction.fromSigned(transaction, compression),
        restored = packed.getSignedTransaction()
      expect(restored.context_free_data.map(value => value.hexString)).toEqual([
        "010203",
        ""
      ])
      expect(
        restored
          .signingDigest(ChainId)
          .msgDigest.equals(transaction.signingDigest(ChainId).msgDigest)
      ).toBe(true)
      expect(restored.id.equals(transaction.id)).toBe(true)
    }
  )

  it("hashes the packed data vector exactly as native transaction::sig_digest does", () => {
    const empty = createEmptySignedTransaction(),
      transaction = SignedTransaction.from({
        ...empty,
        context_free_data: ["010203", ""]
      }),
      // vector length 2, bytes length 3 + payload, bytes length 0.
      expected = createHash("sha256")
        .update(Buffer.from("020301020300", "hex"))
        .digest("hex"),
      data = transaction.signingData(ChainId).hexString
    expect(data.slice(-64)).toBe(expected)
    expect(data.slice(0, -64)).toBe(
      empty.signingData(ChainId).hexString.slice(0, -64)
    )
    expect(empty.signingData(ChainId).hexString.slice(-64)).toBe("0".repeat(64))
    expect(
      transaction
        .signingDigest(ChainId)
        .msgDigest.equals(empty.signingDigest(ChainId).msgDigest)
    ).toBe(false)
    expect(transaction.id.equals(empty.id)).toBe(true)
  })

  it("handles absent data and bounds inflation of context-free data independently", () => {
    const packed = PackedTransaction.fromSigned(
      createEmptySignedTransaction(),
      CompressionType.zlib
    )
    packed.packed_context_free_data = Bytes.from("")
    expect(packed.getSignedTransaction().context_free_data).toEqual([])
    packed.packed_context_free_data = Bytes.from(
      pako.deflate(new Uint8Array(1024))
    )
    expect(() =>
      packed.getSignedTransaction({ maxInflatedBytes: 100 })
    ).toThrow(/zlib output exceeds/)
    packed.packed_context_free_data = Bytes.from("0102")
    expect(() => packed.getSignedTransaction()).toThrow(/inflate/)
  })
})
