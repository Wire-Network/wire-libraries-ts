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
  test("resolves and caches generated contracts from the root proxy", () => {
    const api = createMockApi(),
      sysio = contracts.sysio.createClient({ client: api })

    expect(sysio.msig).toBe(sysio.getSysioContract(SysioContractName.msig))
    expect(sysio.msig.name).toBe(SysioContractName.msig)
    expect(sysio.msig.account).toBe("sysio.msig")
    expect(Reflect.get(sysio, "then")).toBeNull()
  })

  test("rejects unknown contracts, actions, and tables", () => {
    const sysio = contracts.sysio.createClient({ client: createMockApi() })

    expect(() => Reflect.get(sysio, "bogus")).toThrow(
      "Unknown sysio contract: bogus"
    )
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
      { authorization: [{ actor: "alice", permission: "active" }] }
    )

    const [prepared, pushOptions] = api.pushTransaction.mock.calls[0]
    expect(prepared.account).toBe("sysio.epoch")
    expect(prepared.name).toBe("advance")
    expect(prepared.authorization.map(String)).toEqual(["alice@active"])
    expect(pushOptions).toBeUndefined()
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
