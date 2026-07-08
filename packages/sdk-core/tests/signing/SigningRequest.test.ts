import { Transaction } from "@wireio/sdk-core/chain/Transaction"
import { Serializer } from "@wireio/sdk-core/serializer"
import { ChainName } from "@wireio/sdk-core/signing/ChainId"
import { SigningRequest } from "@wireio/sdk-core/signing/SigningRequest"

const createEmptyTransaction = () =>
  Transaction.from({
    expiration: "1970-01-01T00:00:00.000",
    ref_block_num: 0,
    ref_block_prefix: 0,
    context_free_actions: [],
    actions: [],
    transaction_extensions: []
  })

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
