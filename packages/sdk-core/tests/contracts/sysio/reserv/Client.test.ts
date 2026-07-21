import { UInt64 } from "@wireio/sdk-core/chain/Integer"
import { Serializer } from "@wireio/sdk-core/serializer"
import { contracts, SlugName } from "@wireio/sdk-core"
import { SysioReservReservestatus } from "@wireio/sdk-core/types/SysioContractTypes"

const { ReserveClient } = contracts.sysio.reserv

function reserveRow(overrides: Record<string, unknown> = {}) {
  return {
    chain_code: { value: String(SlugName.from("ETHEREUM")) },
    token_code: { value: SlugName.from("ETH") },
    reserve_code: { value: SlugName.from("PRIMARY") },
    name: "Primary ETH",
    description: "Public ETH liquidity",
    status: "RESERVE_STATUS_PENDING",
    reserve_chain_amount: "1000000000",
    reserve_wire_amount: "0",
    source_token_precision: 9,
    connector_weight_bps: 5000,
    creator_addr: { kind: "CHAIN_KIND_EVM", address: "0x1234" },
    requested_wire_amount: "2500000000",
    external_token_amount: "1000000000",
    registered_at_ms: "1720000000000",
    activated_at_ms: "0",
    cancelled_at_ms: "0",
    is_private: false,
    owner: "",
    creator_pub_key: "02abcd",
    ...overrides
  }
}

function clientFixture(rows = [reserveRow()]) {
  const getTableRows = jest.fn(async (params: any) => ({
      rows:
        String(params.table) === "rewardbkt"
          ? [{ balance: "9", lifetime_accrued: "12" }]
          : rows,
      more: false
    })),
    pushTransaction = jest.fn(async (_action: any, _options?: any) => ({
      transaction_id: "reserve-trx"
    })),
    sendReadOnlyTransaction = jest.fn(async () => ({
      processed: {
        action_traces: [
          {
            act: { name: "swapquote" },
            return_value_hex_data: Serializer.encode({
              object: UInt64.from(42),
              type: UInt64
            }).hexString
          }
        ]
      }
    })),
    client = new ReserveClient({
      client: {
        v1: {
          chain: {
            get_table_rows: getTableRows,
            get_info: jest.fn(async () => ({
              getTransactionHeader: () => ({
                expiration: "2026-07-14T12:00:00",
                ref_block_num: 1,
                ref_block_prefix: 2
              })
            })),
            send_read_only_transaction: sendReadOnlyTransaction
          }
        },
        pushTransaction
      } as any
    })

  return { client, getTableRows, pushTransaction, sendReadOnlyTransaction }
}

describe("ReserveClient", () => {
  test("normalizes and filters reserve rows", async () => {
    const { client, getTableRows } = clientFixture(),
      reserves = await client.listReserves({
        chainCode: "ETHEREUM",
        tokenCode: "ETH"
      })

    expect(reserves).toHaveLength(1)
    expect(reserves[0]).toMatchObject({
      chainCode: "ETHEREUM",
      tokenCode: "ETH",
      reserveCode: "PRIMARY",
      status: SysioReservReservestatus.RESERVE_STATUS_PENDING,
      requestedWireAmount: 2500000000n
    })
    expect(getTableRows).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "sysio.reserv",
        table: "reserves",
        scope: "sysio.reserv"
      })
    )
  })

  test("finds one reserve and returns null for a missing code", async () => {
    const { client } = clientFixture()

    await expect(
      client.getReserve({
        chainCode: "ETHEREUM",
        tokenCode: "ETH",
        reserveCode: "PRIMARY"
      })
    ).resolves.toMatchObject({ name: "Primary ETH" })
    await expect(
      client.getReserve({
        chainCode: "ETHEREUM",
        tokenCode: "ETH",
        reserveCode: "MISSING"
      })
    ).resolves.toBeNull()
  })

  test("continues paginating until an exact reserve identity is found", async () => {
    const { client, getTableRows } = clientFixture()
    getTableRows.mockImplementation(async (params: any) => ({
      rows: [
        reserveRow({
          reserve_code: {
            value: SlugName.from(params.lower_bound ? "PRIMARY" : "OTHER")
          }
        })
      ],
      more: !params.lower_bound,
      next_key: params.lower_bound ? "" : "next-page"
    }))

    await expect(
      client.getReserve({
        chainCode: "ETHEREUM",
        tokenCode: "ETH",
        reserveCode: "PRIMARY"
      })
    ).resolves.toMatchObject({ reserveCode: "PRIMARY" })
    expect(getTableRows).toHaveBeenCalledTimes(2)
  })

  test("builds and pushes the exact requested Wire amount", async () => {
    const { client, pushTransaction } = clientFixture()

    await expect(
      client.pushMatchReserve({
        chainCode: "ETHEREUM",
        tokenCode: "ETH",
        reserveCode: "PRIMARY",
        matcher: "alice",
        wireAmount: "2500000000"
      })
    ).resolves.toEqual({ transaction_id: "reserve-trx" })
    expect(pushTransaction).toHaveBeenCalledTimes(1)
    const [action] = pushTransaction.mock.calls[0]
    expect(action.account.toString()).toBe("sysio.reserv")
    expect(action.name.toString()).toBe("matchreserve")
    expect(action.authorization.map(String)).toEqual(["alice@active"])
  })

  test("decodes read-only swapquote and rewards values", async () => {
    const { client } = clientFixture()

    await expect(
      client.getSwapQuote({
        from: {
          chainCode: "ETHEREUM",
          tokenCode: "ETH",
          reserveCode: "PRIMARY"
        },
        fromAmount: 1n,
        to: { chainCode: "SOLANA", tokenCode: "SOL", reserveCode: "PRIMARY" }
      })
    ).resolves.toBe(42n)
    await expect(client.getRewards()).resolves.toEqual({
      balance: 9n,
      lifetimeAccrued: 12n
    })
  })
})
