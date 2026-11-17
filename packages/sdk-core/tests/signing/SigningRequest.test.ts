import pako from "pako"

import { Bytes } from "@wireio/sdk-core/chain/Bytes"
import { Serializer } from "@wireio/sdk-core/serializer"
import * as Base64u from "@wireio/sdk-core/signing/Base64u"
import { ChainName } from "@wireio/sdk-core/signing/ChainId"
import {
  SigningRequest,
  SigningRequestCompression
} from "@wireio/sdk-core/signing/SigningRequest"
import { hexToArray } from "@wireio/sdk-core/Utils"
import {
  createEmptyTransaction,
  EmptyTransactionVaruint32Offsets,
  encodeEmptyTransaction,
  replaceByte
} from "../support/transactions.js"

const SigningRequestCompressionFlag = 1 << 7
const SigningRequestScheme = "esr:"
const LargeInfoKey = "large"
const SigningRequestInflateLimitMessage = /Signing request zlib output exceeds/
const InvalidInflateLimitMessage =
  /Signing request inflate limit must be a non-negative safe integer/
const NonCanonicalTransactionMessage =
  /Signing request transaction is not canonically encoded/
const PaddedZero = hexToArray("8000")
const TrailingByte = Uint8Array.from([0x00])
const Signer = { actor: "alice", permission: "active" }
const TaposContext = {
  expiration: "2026-11-17T12:00:00",
  ref_block_num: 1,
  ref_block_prefix: 2
}

/**
 * Bytes after the transaction in a `fromTransaction` request payload: the flags, an empty
 * callback and an empty info list.
 */
const TransactionRequestTrailerBytes = 3

/** Offset of the callback length in a `fromTransaction` request payload, counted from its end. */
const CallbackLengthOffsetFromEnd = 2

/**
 * Create uncompressed request data (header and payload) for a `fromTransaction` request whose
 * transaction bytes are replaced by `transactionBytes`, written as they are.
 */
function createTransactionRequestData(
  transactionBytes: Uint8Array
): Uint8Array {
  const request = SigningRequest.fromTransaction(
      ChainName.SYS,
      encodeEmptyTransaction()
    ),
    payload = request.getData(),
    trailerStart = payload.byteLength - TransactionRequestTrailerBytes,
    transactionStart = trailerStart - encodeEmptyTransaction().byteLength

  return Uint8Array.from([
    request.version,
    ...payload.subarray(0, transactionStart),
    ...transactionBytes,
    ...payload.subarray(trailerStart)
  ])
}

/** Create a raw-deflated signing request byte stream. */
function createCompressedRequestBytes(
  payload: Uint8Array,
  version = 2
): Uint8Array {
  const compressedPayload = pako.deflateRaw(payload) as Uint8Array
  const data = new Uint8Array(1 + compressedPayload.byteLength)
  data[0] = version | SigningRequestCompressionFlag
  data.set(compressedPayload, 1)
  return data
}

/** Create a raw-deflated signing request URI. */
function createCompressedRequestUri(payload: Uint8Array, version = 2): string {
  return `${SigningRequestScheme}//${Base64u.encode(
    createCompressedRequestBytes(payload, version)
  )}`
}

describe("SigningRequest", () => {
  describe("from", () => {
    it("decodes compressed signing request URIs with bounded raw zlib inflation", () => {
      const transaction = createEmptyTransaction()
      const serializedTransaction = Serializer.encode({ object: transaction })
      const request = SigningRequest.fromTransaction(
        ChainName.SYS,
        serializedTransaction
      )
      const uri = createCompressedRequestUri(request.getData(), request.version)

      const parsedRequest = SigningRequest.from(uri)

      expect(parsedRequest.data.req.variantName).toBe("transaction")
      expect(parsedRequest.getRawTransaction().equals(transaction)).toBe(true)
    })
  })

  describe("fromData", () => {
    it("rejects compressed request payloads above the default inflated byte limit", () => {
      const payload = new Uint8Array(
        SigningRequestCompression.DefaultMaxInflatedBytes + 1
      )
      const data = createCompressedRequestBytes(payload)

      expect(() => SigningRequest.fromData(data)).toThrow(
        SigningRequestInflateLimitMessage
      )
    })

    it("honors custom compressed request inflated byte limits", () => {
      const transaction = createEmptyTransaction()
      const serializedTransaction = Serializer.encode({ object: transaction })
      const request = SigningRequest.fromTransaction(
        ChainName.SYS,
        serializedTransaction
      )
      const payload = request.getData()
      const data = createCompressedRequestBytes(payload, request.version)

      expect(() =>
        SigningRequest.fromData(data, {
          maxInflatedBytes: payload.byteLength - 1
        })
      ).toThrow(SigningRequestInflateLimitMessage)
    })

    it("parses valid compressed requests above the default limit when explicitly raised", () => {
      const transaction = createEmptyTransaction()
      const largeInfoValue = Bytes.from(
        "A".repeat(SigningRequestCompression.DefaultMaxInflatedBytes + 1),
        "utf8"
      )
      const request = SigningRequest.createSync({
        transaction,
        info: {
          [LargeInfoKey]: largeInfoValue
        }
      })
      const payload = request.getData()
      const data = createCompressedRequestBytes(payload, request.version)

      expect(() => SigningRequest.fromData(data)).toThrow(
        SigningRequestInflateLimitMessage
      )

      const parsedRequest = SigningRequest.fromData(data, {
        maxInflatedBytes: payload.byteLength
      })

      expect(parsedRequest.getRawTransaction().equals(transaction)).toBe(true)
      expect(parsedRequest.data.info[0].key).toBe(LargeInfoKey)
      expect(parsedRequest.data.info[0].value.equals(largeInfoValue)).toBe(true)
    })

    it.each([Number.NaN, -1, 1.5])(
      "rejects invalid maxInflatedBytes value %s",
      maxInflatedBytes => {
        const transaction = createEmptyTransaction()
        const serializedTransaction = Serializer.encode({ object: transaction })
        const request = SigningRequest.fromTransaction(
          ChainName.SYS,
          serializedTransaction
        )
        const data = createCompressedRequestBytes(
          request.getData(),
          request.version
        )

        expect(() =>
          SigningRequest.fromData(data, { maxInflatedBytes })
        ).toThrow(InvalidInflateLimitMessage)
      }
    )
  })

  describe("fromTransaction", () => {
    it("encodes the transaction request variant through the generic varuint writer", () => {
      const transaction = createEmptyTransaction()
      const serializedTransaction = Serializer.encode({ object: transaction })
      const request = SigningRequest.fromTransaction(
        ChainName.SYS,
        serializedTransaction
      )

      expect(request.data.req.variantName).toBe("transaction")
      expect(request.getRawTransaction().equals(transaction)).toBe(true)
    })
  })

  describe("canonical transactions", () => {
    it("resolves a canonical transaction request as before", () => {
      const request = SigningRequest.fromData(
          createTransactionRequestData(encodeEmptyTransaction())
        ),
        resolved = request.resolve(new Map(), Signer, TaposContext)

      expect(request.getRawTransaction().equals(createEmptyTransaction())).toBe(
        true
      )
      expect(resolved.transaction.ref_block_num.toNumber()).toBe(
        TaposContext.ref_block_num
      )
      expect(resolved.transaction.actions).toHaveLength(0)
    })

    it.each(EmptyTransactionVaruint32Offsets)(
      "rejects request data whose transaction has a zero-padded %s",
      (_, offset) => {
        const data = createTransactionRequestData(
          replaceByte(encodeEmptyTransaction(), offset, PaddedZero)
        )

        expect(() => SigningRequest.fromData(data)).toThrow(
          NonCanonicalTransactionMessage
        )
      }
    )

    it("rejects a request URI whose transaction has a padded varuint", () => {
      const data = createTransactionRequestData(
          replaceByte(
            encodeEmptyTransaction(),
            EmptyTransactionVaruint32Offsets[0][1],
            PaddedZero
          )
        ),
        uri = `${SigningRequestScheme}//${Base64u.encode(data)}`

      expect(() => SigningRequest.from(uri)).toThrow(
        NonCanonicalTransactionMessage
      )
    })

    it("rejects a compressed request whose transaction has a padded varuint", () => {
      const data = createTransactionRequestData(
          replaceByte(
            encodeEmptyTransaction(),
            EmptyTransactionVaruint32Offsets[0][1],
            PaddedZero
          )
        ),
        compressed = createCompressedRequestBytes(data.subarray(1), data[0])

      expect(() => SigningRequest.fromData(compressed)).toThrow(
        NonCanonicalTransactionMessage
      )
    })

    it("rejects a serialized transaction with a padded varuint", () => {
      expect(() =>
        SigningRequest.fromTransaction(
          ChainName.SYS,
          replaceByte(
            encodeEmptyTransaction(),
            EmptyTransactionVaruint32Offsets[0][1],
            PaddedZero
          )
        )
      ).toThrow(NonCanonicalTransactionMessage)
    })

    it("rejects a serialized transaction with bytes after it", () => {
      expect(() =>
        SigningRequest.fromTransaction(
          ChainName.SYS,
          Uint8Array.from([...encodeEmptyTransaction(), ...TrailingByte])
        )
      ).toThrow(NonCanonicalTransactionMessage)
    })

    it("keeps decoding the request envelope leniently", () => {
      const data = createTransactionRequestData(encodeEmptyTransaction()),
        callbackLengthOffset = data.byteLength - CallbackLengthOffsetFromEnd,
        paddedEnvelope = replaceByte(data, callbackLengthOffset, PaddedZero),
        request = SigningRequest.fromData(paddedEnvelope)

      expect(request.data.callback).toBe("")
      expect(request.getRawTransaction().equals(createEmptyTransaction())).toBe(
        true
      )
    })
  })
})
