import { APIClient } from "@wireio/sdk-core/api/Client"
import type { APIProvider } from "@wireio/sdk-core/api/Provider"
import type { APIResponse } from "@wireio/sdk-core/api/Client"

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
  async call(args: { path: string; params?: unknown }): Promise<APIResponse> {
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

function makeClient(responses: Record<string, any>): APIClient {
  return new APIClient({
    provider: new MockProvider(responses)
  })
}

describe("ChainAPI.get_table_rows — wire-sysio KV row shape", () => {
  test("unwraps the new {key, value, payer?} shape into plain rows", async () => {
    const client = makeClient({
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
    const client = makeClient({
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
    const client = makeClient({
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
    const client = makeClient({
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
    const client = makeClient({
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
    const client = makeClient({
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

  test("does not unwrap user table whose key field is an array", async () => {
    // `typeof [] === "object"` in JS, so an array-valued `key` would
    // pass an object-only check. The wire-sysio KV key is always a
    // struct (Record<string, unknown>), never an array, so rejecting
    // arrays tightens the discriminant at no cost to the real case.
    const client = makeClient({
      "/v1/chain/get_table_rows": {
        rows: [
          { key: ["a", 1], value: "first" },
          { key: ["b", 2], value: "second" }
        ],
        more: false,
        next_key: ""
      }
    })

    const result = await client.v1.chain.get_table_rows({
      code: "user.contract",
      scope: "user.contract",
      table: "tuple_keyed"
    })

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toEqual({ key: ["a", 1], value: "first" })
    expect(result.rows[1]).toEqual({ key: ["b", 2], value: "second" })
  })

  test("does not unwrap user table that happens to have scalar key+value fields", async () => {
    // A user-defined table with struct {key: string, value: uint64} would
    // collide with the wire-sysio KV shape on field-name alone. Requiring
    // `key` to be an object (wire KV keys are always composite) avoids
    // misinterpreting these rows.
    const client = makeClient({
      "/v1/chain/get_table_rows": {
        rows: [
          { key: "some_setting", value: 42 },
          { key: "other_setting", value: 7 }
        ],
        more: false,
        next_key: ""
      }
    })

    const result = await client.v1.chain.get_table_rows({
      code: "user.contract",
      scope: "user.contract",
      table: "settings"
    })

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toEqual({ key: "some_setting", value: 42 })
    expect(result.rows[1]).toEqual({ key: "other_setting", value: 7 })
  })

  test("does not unwrap user table whose key is itself an object", async () => {
    // Pinned repro of the residual false-positive in isWireKvShape: a
    // user-defined row whose top-level struct contains a nested struct
    // named `key` AND a field named `value` is indistinguishable from
    // the wire-sysio KV shape by heuristic alone. The current behavior
    // is that these rows ARE silently unwrapped to `value`. This test
    // documents that known limitation so future tightening of the
    // heuristic (or an ABI-aware detection path) has a regression
    // target to flip from xfail → pass.
    const client = makeClient({
      "/v1/chain/get_table_rows": {
        rows: [
          {
            key: { name: "alice", perm: "active" },
            value: 42
          },
          {
            key: { name: "bob", perm: "active" },
            value: 7
          }
        ],
        more: false,
        next_key: ""
      }
    })

    const result = await client.v1.chain.get_table_rows({
      code: "user.contract",
      scope: "user.contract",
      table: "nested_table"
    })

    // KNOWN FALSE-POSITIVE: the heuristic cannot distinguish this shape
    // from the wire-sysio KV shape, so the rows are unwrapped to the
    // `value` field. When the discriminant is strengthened (e.g. with
    // ABI awareness) this expectation should flip to assert the
    // original `{key, value}` objects are preserved.
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toBe(42)
    expect(result.rows[1]).toBe(7)
  })
})
