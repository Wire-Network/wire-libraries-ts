import { Serializer } from "@wireio/sdk-core/serializer"
import { ChainName } from "@wireio/sdk-core/signing/ChainId"
import { SigningRequest } from "@wireio/sdk-core/signing/SigningRequest"
import { createEmptyTransaction } from "../support/transactions.js"

describe("SigningRequest", () => {
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
