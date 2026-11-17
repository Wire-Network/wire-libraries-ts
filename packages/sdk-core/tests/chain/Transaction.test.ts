import pako from "pako"

import {
  CompressionType,
  PackedTransaction,
  Transaction
} from "@wireio/sdk-core/chain/Transaction"
import { Serializer } from "@wireio/sdk-core/serializer"
import { hexToArray } from "@wireio/sdk-core/Utils"
import {
  createEmptyTransaction,
  EmptyTransactionVaruint32Offsets,
  encodeEmptyTransaction,
  replaceByte
} from "../support/transactions.js"

const NON_CANONICAL_VARUINT32_MESSAGE =
  /varuint32 is not in its shortest encoding/
const TRAILING_BYTES_MESSAGE = /Unread bytes after the packed transaction: 1$/
const PADDED_ZERO = hexToArray("8000")
const PADDED_ONE = hexToArray("8100")
const PADDED_THREE = hexToArray("8300")
const FIFTH_BYTE_ABOVE_BIT_31 = hexToArray("ffffffff1f")
const SIX_BYTE_ZERO = hexToArray("808080808000")
const TRAILING_BYTE = Uint8Array.from([0x00])
const DELAY_SEC_OFFSET = 12
const ACTION_DATA = hexToArray("010203")
const TRANSACTION_EXTENSIONS_LENGTH_BYTES = 1

/**
 * Offset of the authorization count in an encoded {@link createActionTransaction}: after the 13
 * header bytes, the two action-list lengths, and the action's account and name.
 */
const ACTION_AUTHORIZATION_COUNT_OFFSET = 31

/** Create a transaction with one authorized action carrying {@link ACTION_DATA}. */
function createActionTransaction(): Transaction {
  return Transaction.from({
    expiration: "1970-01-01T00:00:00.000",
    ref_block_num: 0,
    ref_block_prefix: 0,
    actions: [
      {
        account: "sysio",
        name: "doit",
        authorization: [{ actor: "alice", permission: "active" }],
        data: ACTION_DATA
      }
    ]
  })
}

/** Offset of the action data length prefix in an encoded {@link createActionTransaction}. */
function actionDataLengthOffset(encoded: Uint8Array): number {
  return (
    encoded.byteLength -
    TRANSACTION_EXTENSIONS_LENGTH_BYTES -
    ACTION_DATA.byteLength -
    1
  )
}

/** Wrap uncompressed transaction bytes in a packed transaction. */
function packUncompressed(transactionBytes: Uint8Array): PackedTransaction {
  return PackedTransaction.from({
    compression: CompressionType.none,
    packed_trx: transactionBytes
  })
}

/** Wrap transaction bytes, zlib-compressed, in a packed transaction. */
function packCompressed(transactionBytes: Uint8Array): PackedTransaction {
  return PackedTransaction.from({
    compression: CompressionType.zlib,
    packed_trx: pako.deflate(transactionBytes)
  })
}

describe("PackedTransaction canonical decoding", () => {
  test("decodes a canonical transaction", () => {
    const transaction = createActionTransaction(),
      packed = packUncompressed(
        Serializer.encode({ object: transaction }).array
      )

    expect(packed.getTransaction({ canonical: true }).equals(transaction)).toBe(
      true
    )
  })

  test("decodes a canonical zlib-compressed transaction", () => {
    const transaction = createActionTransaction(),
      packed = packCompressed(Serializer.encode({ object: transaction }).array)

    expect(packed.getTransaction({ canonical: true }).equals(transaction)).toBe(
      true
    )
  })

  test.each(EmptyTransactionVaruint32Offsets)(
    "rejects a zero-padded %s",
    (_, offset) => {
      const packed = packUncompressed(
        replaceByte(encodeEmptyTransaction(), offset, PADDED_ZERO)
      )

      expect(packed.getTransaction().equals(createEmptyTransaction())).toBe(
        true
      )
      expect(() => packed.getTransaction({ canonical: true })).toThrow(
        NON_CANONICAL_VARUINT32_MESSAGE
      )
    }
  )

  test("rejects a padded action data length", () => {
    const encoded = Serializer.encode({
        object: createActionTransaction()
      }).array,
      packed = packUncompressed(
        replaceByte(encoded, actionDataLengthOffset(encoded), PADDED_THREE)
      )

    expect(packed.getTransaction().equals(createActionTransaction())).toBe(true)
    expect(() => packed.getTransaction({ canonical: true })).toThrow(
      NON_CANONICAL_VARUINT32_MESSAGE
    )
  })

  test("rejects a zero-padded varuint32 in a zlib-compressed transaction", () => {
    const packed = packCompressed(
      replaceByte(encodeEmptyTransaction(), DELAY_SEC_OFFSET, PADDED_ZERO)
    )

    expect(packed.getTransaction().equals(createEmptyTransaction())).toBe(true)
    expect(() => packed.getTransaction({ canonical: true })).toThrow(
      NON_CANONICAL_VARUINT32_MESSAGE
    )
  })

  test("rejects a padded authorization count", () => {
    const packed = packUncompressed(
      replaceByte(
        Serializer.encode({ object: createActionTransaction() }).array,
        ACTION_AUTHORIZATION_COUNT_OFFSET,
        PADDED_ONE
      )
    )

    expect(packed.getTransaction().equals(createActionTransaction())).toBe(true)
    expect(() => packed.getTransaction({ canonical: true })).toThrow(
      NON_CANONICAL_VARUINT32_MESSAGE
    )
  })

  test("rejects a fifth varuint32 byte with bits above bit 31", () => {
    const packed = packUncompressed(
      replaceByte(
        encodeEmptyTransaction(),
        DELAY_SEC_OFFSET,
        FIFTH_BYTE_ABOVE_BIT_31
      )
    )

    expect(() => packed.getTransaction({ canonical: true })).toThrow(
      NON_CANONICAL_VARUINT32_MESSAGE
    )
  })

  test("rejects a varuint32 longer than five bytes", () => {
    const packed = packUncompressed(
      replaceByte(encodeEmptyTransaction(), DELAY_SEC_OFFSET, SIX_BYTE_ZERO)
    )

    expect(() => packed.getTransaction({ canonical: true })).toThrow(
      NON_CANONICAL_VARUINT32_MESSAGE
    )
  })

  test("rejects bytes after the transaction", () => {
    const packed = packUncompressed(
      Uint8Array.from([...encodeEmptyTransaction(), ...TRAILING_BYTE])
    )

    expect(packed.getTransaction().equals(createEmptyTransaction())).toBe(true)
    expect(() => packed.getTransaction({ canonical: true })).toThrow(
      TRAILING_BYTES_MESSAGE
    )
  })

  test("decodes a canonical signed transaction", () => {
    const transaction = createActionTransaction(),
      packed = packUncompressed(
        Serializer.encode({ object: transaction }).array
      )

    expect(
      packed.getSignedTransaction({ canonical: true }).id.equals(transaction.id)
    ).toBe(true)
  })

  test("applies canonical decoding to signed transactions", () => {
    const packed = packUncompressed(
      replaceByte(encodeEmptyTransaction(), DELAY_SEC_OFFSET, PADDED_ZERO)
    )

    expect(() => packed.getSignedTransaction({ canonical: true })).toThrow(
      NON_CANONICAL_VARUINT32_MESSAGE
    )
  })
})
