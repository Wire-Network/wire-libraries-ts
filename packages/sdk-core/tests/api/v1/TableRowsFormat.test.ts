import { Checksum160, Checksum256 } from "@wireio/sdk-core/chain/Checksum"
import { APIClient } from "@wireio/sdk-core/api/Client"
import { TableRowsFormat } from "@wireio/sdk-core/api/v1/Types"
import { Name } from "@wireio/sdk-core/chain/Name"
import { UInt64, UInt128 } from "@wireio/sdk-core/chain/Integer"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/** A protocol fixture independently controls binary and JSON response formats. */
function endpoint(format: TableRowsFormat, value: unknown, cursor = "") {
  const call = jest.fn(async ({ params, path }) => {
    expect(path).toBe("/v1/chain/get_table_rows")
    const binary = params.json === false
    const data = binary ? "0700000000000000" : value
    const row =
      format === TableRowsFormat.wireKv
        ? {
            key: "00000001",
            value: data,
            ...(params.show_payer && { payer: "alice" })
          }
        : format === TableRowsFormat.legacyPayer && params.show_payer
          ? { data, payer: "alice" }
          : data
    return {
      status: 200,
      headers: {},
      text: "",
      json: {
        rows: Number(params.limit) === 0 ? [] : [row],
        more: Boolean(cursor),
        next_key: cursor
      }
    }
  })
  return { client: new APIClient({ provider: { call } }), call }
}
const query = { code: "usr.contract", table: "settings" }

describe("endpoint table transport", () => {
  test.each(Object.values(TableRowsFormat))(
    "preserves ambiguous user fields and payer behavior on %s",
    async format => {
      const row = {
        key: "some_setting",
        value: 42,
        data: "original data",
        payer: "bob",
        owner: "alice"
      }
      const { client, call } = endpoint(format, row)
      expect((await client.v1.chain.get_table_rows(query)).rows).toEqual([row])
      const page = await client.v1.chain.get_table_rows({
        ...query,
        show_payer: true
      })
      expect(page.rows).toEqual([row])
      expect(page.ram_payers?.map(payer => payer?.toString())).toEqual([
        format === TableRowsFormat.legacy ? undefined : "alice"
      ])
      expect(
        call.mock.calls.filter(([args]) => args.params.json === false)
      ).toHaveLength(1)
      expect(call).toHaveBeenCalledTimes(3)
    }
  )

  test.each([
    { key: "some_setting", value: 42 },
    { data: "original data", owner: "alice" },
    { data: "user data", payer: "bob" },
    { key: { account: "alice" }, value: 42 }
  ])("preserves a bare legacy %j when show_payer is ignored", async row => {
    const { client } = endpoint(TableRowsFormat.legacy, row)
    expect(
      (await client.v1.chain.get_table_rows({ ...query, show_payer: true }))
        .rows
    ).toEqual([row])
  })

  test.each(Object.values(TableRowsFormat))(
    "decodes typed binary values on %s",
    async format => {
      const { client } = endpoint(format, 7)
      const page = await client.v1.chain.get_table_rows({
        ...query,
        type: UInt64
      })
      expect(page.rows[0]).toBeInstanceOf(UInt64)
      expect(page.rows[0].toString()).toBe("7")
    }
  )

  test("returns a terminal empty page without probing", async () => {
    const { client, call } = endpoint(TableRowsFormat.wireKv, {})
    expect(
      (await client.v1.chain.get_table_rows({ ...query, limit: 0 })).rows
    ).toEqual([])
    expect(call).toHaveBeenCalledTimes(1)
  })

  test("requires an explicit format when a continuation has no discoverable row", async () => {
    const { client, call } = endpoint(TableRowsFormat.wireKv, {})
    call.mockResolvedValue({
      status: 200,
      headers: {},
      text: "",
      json: { rows: [], more: true, next_key: "0001" }
    })
    await expect(client.v1.chain.get_table_rows(query)).rejects.toThrow(
      "incomplete empty page"
    )
    expect(call).toHaveBeenCalledTimes(2)
  })

  test.each([TableRowsFormat.legacy, TableRowsFormat.legacyPayer])(
    "keeps typed empty-page names without reading ABI on %s",
    async format => {
      const cursor = Name.from("alice").value.toString()
      const { client, call } = endpoint(format, { owner: "alice" }, cursor)
      const page = await client.v1.chain.get_table_rows({ ...query, limit: 0 })
      expect(page.next_key).toBeInstanceOf(Name)
      await client.v1.chain.get_table_rows({
        ...query,
        lower_bound: page.next_key
      })
      expect(call.mock.calls.at(-1)?.[0].params.lower_bound).toBe("alice")
    }
  )

  test("reads an empty legacy binary secondary page without an ABI table", async () => {
    const { client, call } = endpoint(TableRowsFormat.legacyPayer, {}, "7")
    const page = await client.v1.chain.get_table_rows({
      ...query,
      json: false,
      key_type: "i64",
      index_position: "secondary",
      limit: 0
    })
    expect(page.next_key).toBeInstanceOf(UInt64)
    expect(String(page.next_key)).toBe("7")
    expect(call.mock.calls[1][0].params).toMatchObject({
      json: false,
      limit: 1,
      key_type: "i64",
      index_position: "secondary"
    })
  })

  test.each(["0000000000000012", "0x0012", '{"key":12}', "0012:000a"])(
    "preserves opaque %s across empty forward and reverse pages",
    async cursor => {
      const { client, call } = endpoint(
        TableRowsFormat.wireKv,
        { balance: 7 },
        cursor
      )
      const page = await client.v1.chain.get_table_rows({
        ...query,
        limit: 0,
        json: false
      })
      expect(page.next_key).toBe(cursor)
      await client.v1.chain.get_table_rows({
        ...query,
        lower_bound: page.next_key
      })
      expect(call.mock.calls.at(-1)?.[0].params.lower_bound).toBe(cursor)
      await client.v1.chain.get_table_rows({
        ...query,
        reverse: true,
        upper_bound: page.next_key
      })
      expect(call.mock.calls.at(-1)?.[0].params.upper_bound).toBe(cursor)
    }
  )

  test("shares concurrent discovery and keeps endpoint clients isolated", async () => {
    const wire = endpoint(TableRowsFormat.wireKv, { balance: 7 })
    const legacy = endpoint(TableRowsFormat.legacy, { key: "test", value: 7 })
    const pages = await Promise.all([
      wire.client.v1.chain.get_table_rows(query),
      wire.client.v1.chain.get_table_rows(query),
      legacy.client.v1.chain.get_table_rows(query)
    ])
    expect(pages[2].rows).toEqual([{ key: "test", value: 7 }])
    expect(
      wire.call.mock.calls.filter(([args]) => args.params.json === false)
    ).toHaveLength(1)
  })

  test("shares rediscovery after a concurrent empty probe", async () => {
    const { client, call } = endpoint(TableRowsFormat.wireKv, {})
    call.mockResolvedValueOnce({
      status: 200,
      headers: {},
      text: "",
      json: { rows: [], more: false, next_key: "" }
    })
    expect(
      await Promise.all([
        client.v1.chain.getTableRowsFormat(query),
        client.v1.chain.getTableRowsFormat(query),
        client.v1.chain.getTableRowsFormat(query)
      ])
    ).toEqual([undefined, TableRowsFormat.wireKv, TableRowsFormat.wireKv])
    expect(call).toHaveBeenCalledTimes(2)
  })

  test.each([
    { code: "usr.other" },
    { table: "balances" },
    { scope: "alice" },
    { index_position: "secondary" },
    { lower_bound: Checksum256.from("ab".repeat(32)) }
  ] as const)(
    "isolates probe failures from a different query %j",
    async changes => {
      const { client, call } = endpoint(TableRowsFormat.wireKv, { balance: 7 })
      const respond = call.getMockImplementation()!
      const failure = new Error("First table binary read timed out")
      let probes = 0
      call.mockImplementation(async args => {
        if (args.params.json === false && ++probes === 1) throw failure
        return respond(args)
      })
      const results = await Promise.allSettled([
        client.v1.chain.get_table_rows(query),
        client.v1.chain.get_table_rows({ ...query, ...changes }),
        client.v1.chain.get_table_rows({ ...query, ...changes })
      ])
      expect(results).toEqual([
        { status: "rejected", reason: failure },
        {
          status: "fulfilled",
          value: expect.objectContaining({ rows: [{ balance: 7 }] })
        },
        {
          status: "fulfilled",
          value: expect.objectContaining({ rows: [{ balance: 7 }] })
        }
      ])
      expect(probes).toBe(2)
      expect((await client.v1.chain.get_table_rows(query)).rows).toEqual([
        { balance: 7 }
      ])
      expect(probes).toBe(2)
    }
  )

  test("shares a matching probe failure without retrying or caching it", async () => {
    const { client, call } = endpoint(TableRowsFormat.wireKv, { balance: 7 })
    const respond = call.getMockImplementation()!
    const failure = new Error("Binary read timed out")
    let probes = 0
    call.mockImplementation(async args => {
      if (args.params.json === false && ++probes === 1) throw failure
      return respond(args)
    })
    const results = await Promise.allSettled([
      client.v1.chain.get_table_rows(query),
      client.v1.chain.get_table_rows(query)
    ])
    expect(results).toEqual([
      { status: "rejected", reason: failure },
      { status: "rejected", reason: failure }
    ])
    expect(probes).toBe(1)
    expect((await client.v1.chain.get_table_rows(query)).rows).toEqual([
      { balance: 7 }
    ])
    expect(probes).toBe(2)
  })

  test.each([
    [UInt64.from(7), "i64"],
    [UInt128.from(7), "i128"],
    [Checksum160.from("ab".repeat(20)), "ripemd160"],
    [Checksum256.from("ab".repeat(32)), "sha256"]
  ] as const)(
    "preserves the inferred secondary type %s in discovery",
    async (bound, keyType) => {
      const { client, call } = endpoint(TableRowsFormat.legacyPayer, {
        balance: 7
      })
      await client.v1.chain.get_table_rows({
        ...query,
        index_position: "secondary",
        lower_bound: bound
      })
      expect(call).toHaveBeenCalledTimes(2)
      call.mock.calls.forEach(([args]) =>
        expect(args.params.key_type).toBe(keyType)
      )
      const direct = endpoint(TableRowsFormat.legacyPayer, { balance: 7 })
      await direct.client.v1.chain.getTableRowsFormat({
        ...query,
        index_position: "secondary",
        lower_bound: bound
      })
      expect(direct.call.mock.calls[0][0].params.key_type).toBe(keyType)
    }
  )

  test.each([
    "original data",
    "abc",
    { key: "00", value: "original data" },
    { data: "abc", payer: "alice" }
  ])("rejects malformed binary discovery %j without caching it", async row => {
    const { client, call } = endpoint(TableRowsFormat.wireKv, {})
    call.mockResolvedValueOnce({
      status: 200,
      headers: {},
      text: "",
      json: { rows: [row], more: false, next_key: "" }
    })
    await expect(client.v1.chain.getTableRowsFormat(query)).rejects.toThrow(
      "Invalid binary table response"
    )
    expect(await client.v1.chain.getTableRowsFormat(query)).toBe(
      TableRowsFormat.wireKv
    )
  })

  test("does not cache failed discovery and propagates failures", async () => {
    const { client, call } = endpoint(TableRowsFormat.wireKv, {})
    call.mockRejectedValueOnce(new Error("RPC unavailable"))
    await expect(client.v1.chain.getTableRowsFormat(query)).rejects.toThrow(
      "RPC unavailable"
    )
    expect(await client.v1.chain.getTableRowsFormat(query)).toBe(
      TableRowsFormat.wireKv
    )
  })

  test("does not treat an empty probe as a known format", async () => {
    const { client, call } = endpoint(TableRowsFormat.wireKv, {})
    call.mockResolvedValueOnce({
      status: 200,
      headers: {},
      text: "",
      json: { rows: [], more: false, next_key: "" }
    })
    expect(await client.v1.chain.getTableRowsFormat(query)).toBeUndefined()
    expect(await client.v1.chain.getTableRowsFormat(query)).toBe(
      TableRowsFormat.wireKv
    )
  })

  test("supports an explicit format when probing is unavailable", async () => {
    const { call } = endpoint(TableRowsFormat.wireKv, { balance: 7 })
    const client = new APIClient({
      provider: { call },
      tableRowsFormat: TableRowsFormat.wireKv
    })
    expect((await client.v1.chain.get_table_rows(query)).rows).toEqual([
      { balance: 7 }
    ])
    expect(call).toHaveBeenCalledTimes(1)
  })

  test("discovers Wire before decoding the original Devnet capture", async () => {
    const captured = JSON.parse(
      readFileSync(join(__dirname, "fixtures/parked/unpaged.json"), "utf8")
    )
    const { client, call } = endpoint(TableRowsFormat.wireKv, {})
    call.mockResolvedValueOnce({
      status: 200,
      headers: {},
      text: "",
      json: captured
    })
    const page = await client.v1.chain.get_table_rows({
      code: "sysio.synd",
      table: "parked"
    })
    expect(page.rows).toEqual(captured.rows.map(row => row.value))
    expect(
      page.rows
        .filter(row => row.token_code === "LIQSOL")
        .reduce((sum, row) => sum + BigInt(row.balance), 0n)
    ).toBe(556466089165n)
  })
})

test("getRows preserves opaque bounds and frozen options", async () => {
  const { client } = endpoint(TableRowsFormat.wireKv, {})
  const options = Object.freeze({
    contract: " sysio.synd ",
    table: " parked ",
    scope: " sysio.synd ",
    lower_bound: '  {"key":12} ',
    upper_bound: "0x000012",
    index_name: "byowner",
    show_payer: true
  })
  const read = jest
    .spyOn(client.v1.chain, "get_table_rows")
    .mockResolvedValue({ rows: [], more: false })
  await client.getRows(options)
  expect(read).toHaveBeenCalledWith(
    expect.objectContaining({
      code: "sysio.synd",
      table: "parked",
      scope: "sysio.synd",
      index_name: "byowner",
      lower_bound: options.lower_bound,
      upper_bound: options.upper_bound,
      show_payer: true
    })
  )
  expect(options.contract).toBe(" sysio.synd ")
})
