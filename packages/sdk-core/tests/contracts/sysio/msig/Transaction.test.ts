import { Action } from "@wireio/sdk-core/chain/Action"
import { PermissionLevel } from "@wireio/sdk-core/chain/PermissionLevel"
import { Transaction } from "@wireio/sdk-core/chain/Transaction"
import { contracts } from "@wireio/sdk-core"

const { buildProposalTransaction, decodeProposalTransactionActions } = contracts.sysio.msig

const tokenAbi = {
  version: "eosio::abi/1.2",
  types: [],
  structs: [
    {
      name: "transfer",
      base: "",
      fields: [
        { name: "from", type: "name" },
        { name: "to", type: "name" },
        { name: "quantity", type: "asset" },
        { name: "memo", type: "string" }
      ]
    }
  ],
  actions: [{ name: "transfer", type: "transfer", ricardian_contract: "" }],
  tables: [],
  ricardian_clauses: [],
  variants: [],
  action_results: [],
  kv_tables: {}
} as any

describe("proposal transaction helpers", () => {
  test("builds an inner proposal transaction with ABI-encoded actions", () => {
    const transaction = buildProposalTransaction({
      header: {
        expiration: "2026-06-16T16:00:00",
        ref_block_num: 1,
        ref_block_prefix: 2
      },
      actions: [
        {
          account: "sysio.token",
          name: "transfer",
          authorization: [PermissionLevel.from("alice@active")],
          data: {
            from: "alice",
            to: "bob",
            quantity: "1.0000 SYS",
            memo: "msig test"
          }
        }
      ],
      abis: [{ contract: "sysio.token", abi: tokenAbi }]
    })

    expect(transaction).toBeInstanceOf(Transaction)
    expect(transaction.actions.length).toBe(1)
    expect(transaction.actions[0]).toBeInstanceOf(Action)
    expect(transaction.actions[0].account.toString()).toBe("sysio.token")
  })

  test("decodes transaction actions with the matching contract ABI", () => {
    const transaction = buildProposalTransaction({
        header: {
          expiration: "2026-06-16T16:00:00",
          ref_block_num: 1,
          ref_block_prefix: 2
        },
        actions: [
          {
            account: "sysio.token",
            name: "transfer",
            authorization: [PermissionLevel.from("alice@active")],
            data: {
              from: "alice",
              to: "bob",
              quantity: "1.0000 SYS",
              memo: "msig test"
            }
          }
        ],
        abis: [{ contract: "sysio.token", abi: tokenAbi }]
      }),
      decoded = decodeProposalTransactionActions(transaction, [
        { contract: "sysio.token", abi: tokenAbi }
      ])

    expect(decoded).toHaveLength(1)
    expect(decoded[0].decoded).toBe(true)
    expect(decoded[0].data).toMatchObject({
      from: "alice",
      to: "bob",
      quantity: "1.0000 SYS",
      memo: "msig test"
    })
  })
})
