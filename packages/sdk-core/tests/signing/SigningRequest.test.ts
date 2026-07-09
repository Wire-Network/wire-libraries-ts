import pako from "pako"

import { Bytes } from "@wireio/sdk-core/chain/Bytes"
import { Serializer } from "@wireio/sdk-core/serializer"
import * as Base64u from "@wireio/sdk-core/signing/Base64u"
import { ChainName } from "@wireio/sdk-core/signing/ChainId"
import {
  SigningRequest,
  SigningRequestCompression
} from "@wireio/sdk-core/signing/SigningRequest"
import { createEmptyTransaction } from "../support/transactions.js"

const SigningRequestCompressionFlag = 1 << 7
const SigningRequestScheme = "esr:"
const LargeInfoKey = "large"
const SigningRequestInflateLimitMessage = /Signing request zlib output exceeds/
const InvalidInflateLimitMessage =
  /Signing request inflate limit must be a non-negative safe integer/

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
})
