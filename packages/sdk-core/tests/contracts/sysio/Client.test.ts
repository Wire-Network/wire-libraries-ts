import { Action, contracts, SysioContracts } from "@wireio/sdk-core"

const { SysioContractName } = SysioContracts

/** Creates the minimal API surface exercised by the system-contract proxy. */
function createMockApi(rows: unknown[] = []) {
  return {
    pushTransaction: jest.fn(async action => ({ action })),
    v1: {
      chain: {
        get_table_rows: jest.fn(async () => ({
          rows,
          more: false
        })),
        get_table_by_scope: jest.fn(async () => ({
          rows: [{ scope: "alice" }],
          more: ""
        }))
      }
    }
  } as any
}

describe("system contract proxy", () => {
  test("resolves and caches every generated contract and member", () => {
    const api = createMockApi(),
      sysio = contracts.sysio.createClient({ client: api })

    Object.values(SysioContractName).forEach(name => {
      expect(sysio.getSysioContract(name).name).toBe(name)
    })

    expect(sysio.msig).toBe(sysio.getSysioContract(SysioContractName.msig))
    expect(sysio.msig.actions.approve).toBe(sysio.msig.actions.approve)
    expect(sysio.msig.tables.proposal).toBe(sysio.msig.tables.proposal)
    expect(sysio.msig.name).toBe(SysioContractName.msig)
    expect(sysio.msig.account).toBe("sysio.msig")
    expect(sysio.system.account).toBe("sysio")
    expect(Reflect.get(sysio, "then")).toBeNull()
  })

  test("applies root-level account overrides consistently", () => {
    const sysio = contracts.sysio.createClient({
        client: createMockApi(),
        contracts: { [SysioContractName.epoch]: "custom.epoch" }
      }),
      prepared = sysio.epoch.actions.advance.prepare({})

    expect(sysio.epoch.account).toBe("custom.epoch")
    expect(prepared.account).toBe("custom.epoch")
  })

  test("rejects unknown contracts, actions, and tables", () => {
    const sysio = contracts.sysio.createClient({ client: createMockApi() })

    expect(() => Reflect.get(sysio, "bogus")).toThrow(
      "Unknown sysio contract: bogus"
    )
    expect(() =>
      contracts.sysio.getSysioContract(
        "bogus" as SysioContracts.SysioContractName
      )
    ).toThrow("Unknown sysio contract: bogus")
    expect(() => Reflect.get(sysio.epoch.actions, "bogus")).toThrow(
      "Unknown sysio.epoch action: bogus"
    )
    expect(() => Reflect.get(sysio.epoch.tables, "bogus")).toThrow(
      "Unknown sysio.epoch table: bogus"
    )
  })

  test("prepares ABI-encoded actions when a runtime codec is available", () => {
    const msig = contracts.sysio.getSysioContract(SysioContractName.msig),
      prepared = msig.actions.approve.prepare(
        {
          proposer: "alice",
          proposal_name: "upgrade1",
          level: { actor: "bob", permission: "active" },
          proposal_hash: null
        },
        { authorization: ["bob@active"] }
      )

    expect(prepared).toBeInstanceOf(Action)
    expect((prepared as Action).authorization.map(String)).toEqual([
      "bob@active"
    ])
  })

  test("prepares complete msig transactions despite inherited ABI fields", () => {
    const msig = contracts.sysio.getSysioContract(SysioContractName.msig),
      prepared = msig.actions.propose.prepare(
        {
          proposer: "alice",
          proposal_name: "upgrade1",
          requested: [{ actor: "bob", permission: "active" }],
          trx: {
            expiration: "2026-01-01T00:00:00",
            ref_block_num: 0,
            ref_block_prefix: 0,
            max_net_usage_words: 0,
            max_cpu_usage_ms: 0,
            delay_sec: 0,
            context_free_actions: [],
            actions: [],
            transaction_extensions: []
          }
        },
        { authorization: ["alice@active"] }
      )

    expect(prepared).toBeInstanceOf(Action)
    const decoded = (prepared as Action).decodeData(
      contracts.sysio.msig.MsigPropose
    )
    expect(decoded.proposer.toString()).toBe("alice")
    expect(decoded.requested.map(String)).toEqual(["bob@active"])
    expect(decoded.trx.actions).toEqual([])
  })

  test("keeps non-workflow actions available through the generated proxy", () => {
    const authex = contracts.sysio.getSysioContract(SysioContractName.authex),
      prepared = authex.actions.clearlinks.prepare(
        {},
        { authorization: ["sysio.authex@active"] }
      )

    expect(prepared).not.toBeInstanceOf(Action)
    expect(prepared).toMatchObject({
      contract: SysioContractName.authex,
      account: "sysio.authex",
      name: "clearlinks",
      data: {}
    })
  })

  test("falls back to a typed AnyAction when synchronous encoding fails", () => {
    const msig = contracts.sysio.getSysioContract(SysioContractName.msig),
      data = {},
      prepared = msig.actions.approve.prepare(data as any)

    expect(prepared).not.toBeInstanceOf(Action)
    expect(prepared).toMatchObject({
      contract: SysioContractName.msig,
      account: "sysio.msig",
      name: "approve",
      authorization: [],
      data
    })
  })

  test("prepares generated contracts without hand-written codecs", () => {
    const epoch = contracts.sysio.getSysioContract(SysioContractName.epoch),
      prepared = epoch.actions.advance.prepare({})

    expect(prepared).not.toBeInstanceOf(Action)
    expect(prepared).toMatchObject({
      contract: SysioContractName.epoch,
      account: "sysio.epoch",
      name: "advance",
      authorization: [],
      data: {}
    })
  })

  test("uses a caller ABI to encode generated actions without local codecs", () => {
    const epoch = contracts.sysio.getSysioContract(SysioContractName.epoch),
      prepared = epoch.actions.advance.prepare(
        {},
        {
          abi: {
            version: "sysio::abi/1.2",
            structs: [{ name: "advance", base: "", fields: [] }],
            actions: [
              {
                name: "advance",
                type: "advance",
                ricardian_contract: ""
              }
            ]
          }
        }
      )

    expect(prepared).toBeInstanceOf(Action)
    expect((prepared as Action).data.hexString).toBe("")
  })

  test("invokes prepared actions through the configured API client", async () => {
    const api = createMockApi(),
      epoch = contracts.sysio.getSysioContract(SysioContractName.epoch, {
        client: api
      })

    await epoch.actions.advance.invoke(
      {},
      {
        authorization: [{ actor: "alice", permission: "active" }],
        pushOptions: { wait_final: true }
      }
    )

    const [prepared, pushOptions] = api.pushTransaction.mock.calls[0]
    expect(prepared.account).toBe("sysio.epoch")
    expect(prepared.name).toBe("advance")
    expect(prepared.authorization.map(String)).toEqual(["alice@active"])
    expect(pushOptions).toEqual({ wait_final: true })
  })

  test("queries generated tables with the complete RPC option surface", async () => {
    const rows = [{ current_epoch_index: 7 }],
      api = createMockApi(rows),
      epoch = contracts.sysio.getSysioContract(SysioContractName.epoch, {
        client: api,
        contract: "custom.epoch"
      }),
      result = await epoch.tables.epochstate.query({
        scope: "custom.scope",
        lower_bound: "5",
        limit: 10,
        reverse: true
      })

    expect(result.rows).toEqual(rows)
    expect(api.v1.chain.get_table_rows).toHaveBeenCalledWith({
      code: "custom.epoch",
      table: "epochstate",
      scope: "custom.scope",
      json: true,
      lower_bound: "5",
      limit: 10,
      reverse: true
    })
  })

  test("supports table aliases, first-row reads, and scope discovery", async () => {
    const row = { current_epoch_index: 7 },
      api = createMockApi([row]),
      epoch = contracts.sysio.getSysioContract(SysioContractName.epoch, {
        client: api
      })

    await expect(epoch.tables.epochstate.rows()).resolves.toMatchObject({
      rows: [row]
    })
    await expect(epoch.tables.epochstate.first()).resolves.toEqual(row)
    await expect(epoch.tables.epochstate.scopes()).resolves.toEqual(["alice"])
    expect(api.v1.chain.get_table_by_scope).toHaveBeenCalledWith({
      code: "sysio.epoch",
      table: "epochstate"
    })

    const empty = contracts.sysio.getSysioContract(SysioContractName.epoch, {
      client: createMockApi()
    })
    await expect(empty.tables.epochstate.first()).resolves.toBeNull()
  })

  test("requires an API client only for reads and invocation", async () => {
    const epoch = contracts.sysio.getSysioContract(SysioContractName.epoch)

    expect(() => epoch.actions.advance.prepare({})).not.toThrow()
    await expect(epoch.tables.epochstate.query()).rejects.toThrow(
      "An APIClient is required to query or invoke a system contract."
    )
    await expect(epoch.actions.advance.invoke({})).rejects.toThrow(
      "An APIClient is required to query or invoke a system contract."
    )
  })
})
