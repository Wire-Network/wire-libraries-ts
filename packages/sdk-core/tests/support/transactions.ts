import {
  SignedTransaction,
  Transaction
} from "@wireio/sdk-core/chain/Transaction"

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
