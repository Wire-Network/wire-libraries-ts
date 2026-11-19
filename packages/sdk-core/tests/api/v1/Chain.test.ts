import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createClient as createSysioClient } from "@wireio/sdk-core/contracts/sysio/Client"
import { APIClient } from "@wireio/sdk-core/api/Client"
import type { APIProvider } from "@wireio/sdk-core/api/Provider"
import type { APIResponse } from "@wireio/sdk-core/api/Client"
import {
  type GetTableRowsParams,
  GetBlockInfoResponse,
  GetBlockResponse
} from "@wireio/sdk-core/api/v1/Types"
import { Serializer } from "@wireio/sdk-core/serializer"
import { Name } from "@wireio/sdk-core/chain/Name"
import { Checksum256 } from "@wireio/sdk-core/chain/Checksum"
import { UInt64 } from "@wireio/sdk-core/chain/Integer"

// Tests for the wire-sysio PR #290 unified get_table_rows response
// shape — KV-backed tables now return rows as `{key, value, payer?}`
// objects instead of the legacy form (decoded struct directly, or
// `{data, payer}` when show_payer is set). The Chain.get_table_rows
// wrapper detects the new shape and unwraps it so downstream callers
// keep seeing the same row layout they always have.

// Minimal in-memory APIProvider for unit tests. Returns the JSON body
// passed via the `responses` map keyed by request path.
class MockProvider implements APIProvider {
  constructor(private responses: Record<string, any>) {}
  async call(args: Parameters<APIProvider["call"]>[0]): Promise<APIResponse> {
    const json = this.responses[args.path]
    if (json === undefined) {
      throw new Error(`MockProvider: no response registered for ${args.path}`)
    }
    return {
      status: 200,
      headers: {},
      json,
      text: JSON.stringify(json)
    } as unknown as APIResponse
  }
}

/** Captures serialized request parameters while returning one fixed response. */
class CapturingProvider implements APIProvider {
  params: unknown

  async call(args: Parameters<APIProvider["call"]>[0]): Promise<APIResponse> {
    this.params = args.params
    return {
      status: 200,
      headers: {},
      json: { rows: [], more: false },
      text: ""
    }
  }
}

function createClient(responses: Record<string, any>): APIClient {
  return new APIClient({
    provider: new MockProvider(responses)
  })
}

describe("ChainAPI.get_block", () => {
  test("decodes Wire transaction receipt shape", () => {
    const transactionId = "1".repeat(64),
      block = Serializer.decode({
        type: GetBlockResponse,
        object: {
          timestamp: "2024-01-01T00:00:00.000",
          producer: "sysio",
          previous: "0".repeat(64),
          transaction_mroot: "0".repeat(64),
          finality_mroot: "0".repeat(64),
          qc_claim: {
            block_num: 1,
            is_strong_qc: false
          },
          producer_signatures: [],
          transactions: [
            {
              cpu_usage_us: [1570],
              trx: transactionId
            }
          ],
          id: "0".repeat(64),
          block_num: 1,
          ref_block_prefix: 0
        }
      })

    expect(Number(block.transactions[0].cpu_usage_us[0])).toBe(1570)
    expect(String(block.transactions[0].id)).toBe(transactionId)
  })

  test("decodes Wire block info response shape", () => {
    const info = Serializer.decode({
      type: GetBlockInfoResponse,
      object: {
        block_num: 1,
        ref_block_num: 1,
        id: "0".repeat(64),
        timestamp: "2024-01-01T00:00:00.000",
        producer: "sysio",
        previous: "0".repeat(64),
        transaction_mroot: "0".repeat(64),
        finality_mroot: "0".repeat(64),
        qc_claim: {
          block_num: 1,
          is_strong_qc: false
        },
        producer_signatures: [],
        ref_block_prefix: 0
      }
    })

    expect(Number(info.block_num)).toBe(1)
    expect(Number(info.qc_claim.block_num)).toBe(1)
    expect(info.producer_signatures).toEqual([])
  })
})

describe("ChainAPI.get_account", () => {
  test("decodes system accounts that omit the creation timestamp", async () => {
    const client = createClient({
        "/v1/chain/get_account": {
          account_name: "sysio",
          head_block_num: 729126,
          head_block_time: "2026-07-21T19:06:21.000",
          privileged: true,
          last_code_update: "2026-07-16T21:03:45.500",
          ram_quota: 464220502,
          net_weight: -1,
          cpu_weight: -1,
          net_limit: { used: -1, available: -1, max: -1 },
          cpu_limit: { used: -1, available: -1, max: -1 },
          ram_usage: 1745389,
          permissions: []
        }
      }),
      account = await client.v1.chain.get_account("sysio")

    expect(account.account_name.toString()).toBe("sysio")
    expect(account.created).toBeNull()
  })

  test("decodes each permission's linked actions and the actions linked to sysio.any", async () => {
    const client = createClient({
        "/v1/chain/get_account": {
          account_name: "sysio.andon",
          head_block_num: 729126,
          head_block_time: "2026-07-21T19:06:21.000",
          privileged: true,
          last_code_update: "2026-07-16T21:03:45.500",
          ram_quota: 464220502,
          net_weight: -1,
          cpu_weight: -1,
          net_limit: { used: -1, available: -1, max: -1 },
          cpu_limit: { used: -1, available: -1, max: -1 },
          ram_usage: 1745389,
          permissions: [
            {
              perm_name: "pull",
              parent: "active",
              required_auth: {
                threshold: 1,
                keys: [],
                accounts: [
                  { permission: { actor: "andon.panic", permission: "active" }, weight: 1 }
                ]
              },
              linked_actions: [{ account: "sysio.andon", action: "pull" }]
            }
          ],
          sysio_any_linked_actions: [{ account: "sysio.token" }]
        }
      }),
      account = await client.v1.chain.get_account("sysio.andon")

    expect(
      account.permissions[0].linked_actions.map(link => [
        String(link.account),
        String(link.action)
      ])
    ).toEqual([["sysio.andon", "pull"]])
    expect(account.sysio_any_linked_actions).toHaveLength(1)
    expect(String(account.sysio_any_linked_actions[0].account)).toBe("sysio.token")
    // A contract-wide link names no action.
    expect(account.sysio_any_linked_actions[0].action).toBeNull()
  })

  test("decodes a response that omits the sysio.any links", async () => {
    const client = createClient({
        "/v1/chain/get_account": {
          account_name: "alice",
          head_block_num: 1,
          head_block_time: "2026-07-21T19:06:21.000",
          privileged: false,
          last_code_update: "1970-01-01T00:00:00.000",
          ram_quota: 1144,
          net_weight: 0,
          cpu_weight: 0,
          net_limit: { used: 0, available: 0, max: 0 },
          cpu_limit: { used: 0, available: 0, max: 0 },
          ram_usage: 1000,
          permissions: []
        }
      }),
      account = await client.v1.chain.get_account("alice")

    expect(account.sysio_any_linked_actions).toBeUndefined()
  })
})

describe("ChainAPI.get_table_rows — wire-sysio KV row shape", () => {
  test.each([
    ["byname", '{"byname":"16406237203414318128"}'],
    [
      "bypubkey",
      '{"bypubkey":"3054c49cc19a07b8947de3b99239b3dc6cef985f732bfa5f9f8c06ff1a8725f7"}'
    ],
    [
      "bypubkey",
      "3054c49cc19a07b8947de3b99239b3dc6cef985f732bfa5f9f8c06ff1a8725f7"
    ]
  ])(
    "preserves the %s KV cursor for the next request",
    async (index, cursor) => {
      const provider = new MockProvider({
          "/v1/chain/get_table_rows": { rows: [], more: true, next_key: cursor }
        }),
        call = jest.spyOn(provider, "call"),
        client = new APIClient({ provider }),
        params = { code: "sysio.authex", table: "links", index_name: index },
        page = await client.v1.chain.get_table_rows<string>(params)

      expect(page.next_key).toBe(cursor)
      await client.v1.chain.get_table_rows<string>({
        ...params,
        lower_bound: page.next_key
      })
      expect(call).toHaveBeenLastCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({ lower_bound: cursor })
        })
      )
    }
  )

  test("preserves a primary KV cursor without a named index", async () => {
    const cursor = '{"key":17}',
      client = createClient({
        "/v1/chain/get_table_rows": {
          rows: [{ key: { key: 16 }, value: { username: "alice" } }],
          more: true,
          next_key: cursor
        }
      }),
      page = await client.v1.chain.get_table_rows<string>({
        code: "sysio.authex",
        table: "links"
      })

    expect(page.rows).toEqual([{ username: "alice" }])
    expect(page.next_key).toBe(cursor)
  })

  test("still decodes legacy numeric cursors and rejects invalid numbers", async () => {
    const cursor = Name.from("alice").value.toString(),
      client = createClient({
        "/v1/chain/get_table_rows": {
          rows: [{ data: { balance: 1 }, payer: "alice" }],
          more: true,
          next_key: cursor
        }
      }),
      params = { code: "sysio.token", table: "accounts" },
      names = await client.v1.chain.get_table_rows(params),
      integers = await client.v1.chain.get_table_rows({
        ...params,
        key_type: "i64"
      })

    expect(names.next_key).toBeInstanceOf(Name)
    expect(String(names.next_key)).toBe("alice")
    expect(integers.next_key).toBeInstanceOf(UInt64)
    expect(String(integers.next_key)).toBe(cursor)
    const invalid = createClient({
      "/v1/chain/get_table_rows": {
        rows: [{ data: { balance: 1 }, payer: "alice" }],
        more: true,
        next_key: "invalid"
      }
    })
    await expect(invalid.v1.chain.get_table_rows(params)).rejects.toThrow(
      "Invalid number"
    )
  })

  test("forwards named KV secondary-index bounds", async () => {
    const provider = new CapturingProvider(),
      client = new APIClient({ provider })

    await client.v1.chain.get_table_rows({
      code: "sysio.authex",
      table: "links",
      index_name: "byname",
      lower_bound: '{"byname":"16406237203375587328"}'
    })

    expect(provider.params).toEqual(
      expect.objectContaining({
        index_name: "byname",
        lower_bound: '{"byname":"16406237203375587328"}'
      })
    )
  })

  test("unwraps the new {key, value, payer?} shape into plain rows", async () => {
    const client = createClient({
      "/v1/chain/get_table_rows": {
        rows: [
          {
            key: { scope: "alice", sym_code: "1397703940" },
            value: { balance: "100.0000 SYS" }
          },
          {
            key: { scope: "alice", sym_code: "1145521988" },
            value: { balance: "200.0000 AAA" }
          }
        ],
        more: false,
        next_key: ""
      }
    })

    const result = await client.v1.chain.get_table_rows({
      code: "sysio.token",
      scope: "alice",
      table: "accounts"
    })

    expect(result.rows).toHaveLength(2)
    // Each row is the unwrapped `value` (the decoded struct), not the
    // outer `{key, value}` wrapper.
    expect(result.rows[0]).toEqual({ balance: "100.0000 SYS" })
    expect(result.rows[1]).toEqual({ balance: "200.0000 AAA" })
    expect(result.more).toBe(false)
    expect(result.ram_payers).toBeUndefined()
  })

  test("unwraps the new shape with show_payer and captures payers", async () => {
    const client = createClient({
      "/v1/chain/get_table_rows": {
        rows: [
          {
            key: { scope: "alice", sym_code: "1397703940" },
            value: { balance: "100.0000 SYS" },
            payer: "alice"
          },
          {
            key: { scope: "alice", sym_code: "1145521988" },
            value: { balance: "200.0000 AAA" },
            payer: "sysio"
          }
        ],
        more: false,
        next_key: ""
      }
    })

    const result = await client.v1.chain.get_table_rows({
      code: "sysio.token",
      scope: "alice",
      table: "accounts",
      show_payer: true
    })

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toEqual({ balance: "100.0000 SYS" })
    expect(result.rows[1]).toEqual({ balance: "200.0000 AAA" })
    expect(result.ram_payers).toBeDefined()
    expect(result.ram_payers).toHaveLength(2)
    expect(String(result.ram_payers![0])).toBe("alice")
    expect(String(result.ram_payers![1])).toBe("sysio")
  })

  test("preserves legacy plain-row shape from EOSIO chains", async () => {
    // EOSIO chains still return rows as the decoded struct directly
    // (no {key, value} wrapper). The wrapper must not touch these.
    const client = createClient({
      "/v1/chain/get_table_rows": {
        rows: [
          { owner: "alice", balance: "100.0000 SYS" },
          { owner: "bob", balance: "200.0000 SYS" }
        ],
        more: false,
        next_key: ""
      }
    })

    const result = await client.v1.chain.get_table_rows({
      code: "sysio.token",
      scope: "sysio.token",
      table: "accounts"
    })

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toEqual({ owner: "alice", balance: "100.0000 SYS" })
    expect(result.rows[1]).toEqual({ owner: "bob", balance: "200.0000 SYS" })
  })

  test("preserves legacy {data, payer} show_payer shape from EOSIO chains", async () => {
    const client = createClient({
      "/v1/chain/get_table_rows": {
        rows: [
          { data: { owner: "alice", balance: "100.0000 SYS" }, payer: "alice" },
          { data: { owner: "bob", balance: "200.0000 SYS" }, payer: "sysio" }
        ],
        more: false,
        next_key: ""
      }
    })

    const result = await client.v1.chain.get_table_rows({
      code: "sysio.token",
      scope: "sysio.token",
      table: "accounts",
      show_payer: true
    })

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toEqual({ owner: "alice", balance: "100.0000 SYS" })
    expect(result.rows[1]).toEqual({ owner: "bob", balance: "200.0000 SYS" })
    expect(result.ram_payers).toHaveLength(2)
    expect(String(result.ram_payers![0])).toBe("alice")
    expect(String(result.ram_payers![1])).toBe("sysio")
  })

  test("empty rows array works for both shapes", async () => {
    const client = createClient({
      "/v1/chain/get_table_rows": {
        rows: [],
        more: false,
        next_key: ""
      }
    })

    const result = await client.v1.chain.get_table_rows({
      code: "sysio.token",
      scope: "alice",
      table: "accounts"
    })

    expect(result.rows).toEqual([])
    expect(result.more).toBe(false)
  })

  test("missing payer in new shape is reported as undefined", async () => {
    // The unified API makes `payer` optional. When show_payer is true
    // but a row was returned without a payer, the wrapper pushes
    // `undefined` so the absent-payer case is explicit to callers rather
    // than silently coerced to an empty Name.
    const client = createClient({
      "/v1/chain/get_table_rows": {
        rows: [
          {
            key: { scope: "alice", sym_code: "1397703940" },
            value: { balance: "100.0000 SYS" }
            // payer intentionally omitted
          }
        ],
        more: false,
        next_key: ""
      }
    })

    const result = await client.v1.chain.get_table_rows({
      code: "sysio.token",
      scope: "alice",
      table: "accounts",
      show_payer: true
    })

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toEqual({ balance: "100.0000 SYS" })
    expect(result.ram_payers).toHaveLength(1)
    expect(result.ram_payers![0]).toBeUndefined()
  })

  test.each([
    { key: ["a", 1], value: "first" },
    { key: "some_setting", value: 42 },
    { key: "0000aabb", value: { balance: 42 } },
    { key: { name: "alice", perm: "active" }, value: 42 },
    { data: "data", payer: "bob", key: "0xdeadbeef", value: 42 }
  ])("preserves legacy user fields in %j", async row => {
    const provider = new MockProvider({}),
      call = jest
        .spyOn(provider, "call")
        .mockImplementation(async ({ params }) => {
          // Legacy get_table_rows wraps the complete user struct only when asked.
          const result = (params as GetTableRowsParams).show_payer
            ? { data: row, payer: "alice" }
            : row
          return {
            status: 200,
            headers: {},
            json: { rows: [result], more: false },
            text: ""
          }
        }),
      client = new APIClient({ provider }),
      page = await client.v1.chain.get_table_rows({
        code: "usr.contract",
        table: "settings"
      })

    expect(page.rows).toEqual([row])
    expect(page.ram_payers).toBeUndefined()
    expect(call).toHaveBeenCalledTimes(1)
  })

  test("decodes typed binary KV values and keeps digit-only cursor bytes", async () => {
    const cursor = "0000000000000012",
      client = createClient({
        "/v1/chain/get_table_rows": {
          rows: [
            {
              key: "0000000000000011",
              value: "0700000000000000",
              payer: "alice"
            }
          ],
          more: true,
          next_key: cursor
        }
      }),
      page = await client.v1.chain.get_table_rows<typeof UInt64, string>({
        code: "usr.contract",
        table: "settings",
        type: UInt64,
        show_payer: true
      })

    expect(page.rows[0]).toBeInstanceOf(UInt64)
    expect(String(page.rows[0])).toBe("7")
    expect(page.next_key).toBe(cursor)
    expect(page.ram_payers?.map(String)).toEqual(["alice"])
  })

  test.each([true, false])(
    "resolves an empty binary page with KV=%s from the deployed ABI",
    async kv => {
      const cursor = "0000000000000012",
        client = createClient({
          "/v1/chain/get_table_rows": {
            rows: [],
            more: true,
            next_key: cursor
          },
          "/v1/chain/get_abi": {
            abi: { tables: [{ name: "settings", ...(kv && { table_id: 0 }) }] }
          }
        }),
        page = await client.v1.chain.get_table_rows({
          code: "usr.contract",
          table: "settings",
          json: false,
          key_type: "i64"
        })

      if (kv) {
        expect(page.next_key).toBe(cursor)
      } else {
        expect(page.next_key).toBeInstanceOf(UInt64)
        expect(String(page.next_key)).toBe("12")
      }
    }
  )

  test("keeps the legacy checksum type for a hex secondary index", async () => {
    const cursor = "ab".repeat(32),
      row = { key: cursor, value: 12 },
      client = createClient({
        "/v1/chain/get_table_rows": {
          rows: [{ data: row, payer: "alice" }],
          more: true,
          next_key: cursor
        }
      }),
      page = await client.v1.chain.get_table_rows({
        code: "usr.contract",
        table: "settings",
        index_position: "secondary",
        key_type: "sha256"
      })
    expect(page.rows).toEqual([row])
    expect(page.next_key).toBeInstanceOf(Checksum256)
    expect(String(page.next_key)).toBe(cursor)
  })

  test("reports a missing table ABI for an ambiguous empty-page cursor", async () => {
    const client = createClient({
      "/v1/chain/get_table_rows": { rows: [], more: true, next_key: "0012" },
      "/v1/chain/get_abi": { abi: { tables: [] } }
    })
    await expect(
      client.v1.chain.get_table_rows({
        code: "usr.contract",
        table: "settings",
        json: false
      })
    ).rejects.toThrow("Missing ABI table definition for usr.contract::settings")
  })

  test("unwraps a KV row with its own key and value exactly once", async () => {
    const row = { key: { account: "alice" }, value: 7 },
      options = { code: "usr.contract", table: "settings", values_only: true },
      provider = new MockProvider({
        "/v1/chain/get_table_rows": {
          rows: [{ key: "0x0002", value: row }],
          more: false
        }
      }),
      call = jest.spyOn(provider, "call"),
      page = await new APIClient({ provider }).v1.chain.get_table_rows(options)

    expect(call.mock.calls[0][0].params).not.toEqual(
      expect.objectContaining({ values_only: true })
    )
    expect(page.rows).toEqual([row])
  })
})

/** The first two Wire RPC responses come verbatim from the Nov 18 SHARED-32
 * replay. The archive ends at page one. Its exact next_key was resumed on
 * Nov 19 to capture the continuation on the same Devnet.
 */
describe("sysio.synd parked — captured Devnet pages", () => {
  const capture = (name: string) =>
      JSON.parse(
        readFileSync(
          join(__dirname, "fixtures", "parked", name + ".json"),
          "utf8"
        )
      ),
    path = "/v1/chain/get_table_rows"

  test("returns the exact balance for the 81-row capture", async () => {
    const response = capture("unpaged"),
      client = createClient({ [path]: response }),
      { rows, more, next_key } = await createSysioClient({
        client
      }).synd.tables.parked.query({ limit: 100 })
    expect(rows).toHaveLength(81)
    expect(rows).toEqual(response.rows.map(row => row.value))
    expect(
      rows
        .filter(row => row.token_code === "LIQSOL")
        .reduce((sum, row) => sum + BigInt(row.balance), 0n)
    ).toBe(556466089165n)
    expect(more).toBe(false)
    expect(next_key).toBeUndefined()
  })

  test("resumes at the exact cursor and returns each captured position once", async () => {
    const first = capture("first"),
      continuation = capture("continuation"),
      provider = new MockProvider({}),
      call = jest
        .spyOn(provider, "call")
        .mockImplementation(async ({ path: requestPath, params }) => {
          expect(requestPath).toBe(path)
          const { lower_bound, index_name } =
            params as GetTableRowsParams<string>
          expect(index_name).toBeUndefined()
          const json = lower_bound === undefined ? first : continuation
          if (json === continuation) expect(lower_bound).toBe(first.next_key)
          return { status: 200, headers: {}, json, text: "" }
        }),
      table = createSysioClient({ client: new APIClient({ provider }) }).synd
        .tables.parked,
      page1 = await table.query<string>({ limit: 100 })
    expect(page1.more).toBe(true)
    expect(page1.next_key).toBe(first.next_key)
    const page2 = await table.query<string>({
      limit: 100,
      lower_bound: page1.next_key
    })
    expect(page2.more).toBe(false)
    expect(page2.next_key).toBeUndefined()
    expect([page1.rows.length, page2.rows.length]).toEqual([100, 96])
    const rows = [...page1.rows, ...page2.rows]
    expect(rows).toEqual(
      [...first.rows, ...continuation.rows].map(row => row.value)
    )
    expect(
      new Set(
        rows.map(row =>
          JSON.stringify([row.token_code, row.chain_kind, row.pubkey])
        )
      ).size
    ).toBe(rows.length)
    expect(call).toHaveBeenCalledTimes(2)
  })
})

describe("ChainAPI.get_table_by_scope", () => {
  test("decodes Wire rows that omit payer and count", async () => {
    const client = createClient({
      "/v1/chain/get_table_by_scope": {
        rows: [
          {
            code: "sysio.msig",
            scope: "alice",
            table: "proposal"
          }
        ],
        more: ""
      }
    })

    const result = await client.v1.chain.get_table_by_scope({
      code: "sysio.msig",
      table: "proposal"
    })

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].code.toString()).toBe("sysio.msig")
    expect(result.rows[0].scope.toString()).toBe("alice")
    expect(result.rows[0].table.toString()).toBe("proposal")
    expect(result.rows[0].payer == null).toBe(true)
    expect(result.rows[0].count == null).toBe(true)
    expect(result.more).toBe("")
  })
})
