import { arrayify } from "@ethersproject/bytes"
import { computeAddress } from "@ethersproject/transactions"

import {
  Action,
  API,
  APIClient,
  Bytes,
  contracts,
  KeyType,
  Name,
  PrivateKey,
  SysioContracts,
  UInt64
} from "@wireio/sdk-core"

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

  test("rejects retired capital actions and preserves the required gross return minimum", () => {
    const sysio = contracts.sysio.createClient({ client: createMockApi() })
    for (const [contract, action] of [
      [sysio.liq, "setkicker"],
      [sysio.dclaim, "onreward"],
      [sysio.system, "fundclaim"]
    ] as const) {
      expect(() => Reflect.get(contract.actions, action)).toThrow("Unknown")
    }
    const data: SysioContracts.SysioSyndSetconfigAction = {
      chain_code: "SOLANA",
      token_code: "LIQSOL",
      synd_fee_bps: 0,
      desynd_fee_bps: 0,
      synd_burst: 1_000_000_000,
      synd_refill: 1_000_000_000,
      desynd_burst: 1_000_000_000,
      desynd_refill: 1_000_000_000,
      window_sec: 60,
      bounty: 0,
      challenge_extra: 1_000_000_000,
      min_desyndicate: 50_000_000,
      desynd_fee_flat: 100_000,
      custody_shortfall_bps: 0
    }
    expect(sysio.synd.actions.setconfig.prepare(data)).toMatchObject({
      name: "setconfig",
      data: { min_desyndicate: 50_000_000, desynd_fee_flat: 100_000, custody_shortfall_bps: 0 }
    })
  })

  test("does not expose removed reward or reserve-creation wire values", () => {
    for (const type of [60950, 60958]) {
      expect(SysioContracts.SysioMsgchAttestationtype[type]).toBeUndefined()
    }
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
      publicKey = PrivateKey.generate(KeyType.EM).toPublic(),
      data: SysioContracts.SysioAuthexRecordlinkAction = {
        account: "alice",
        chain_kind: SysioContracts.SysioAuthexChainkind.CHAIN_KIND_EVM,
        pub_key: publicKey.toString(),
        native_address: Bytes.from(
          arrayify(computeAddress(publicKey.data.array))
        ).hexString
      },
      prepared = authex.actions.recordlink.prepare(data, {
        authorization: ["sysio.authex@active"]
      })

    expect(prepared).not.toBeInstanceOf(Action)
    expect(prepared).toMatchObject({
      contract: SysioContractName.authex,
      account: "sysio.authex",
      name: "recordlink",
      data
    })
  })

  test("preserves snapshot cadence in generated system action and table types", async () => {
    const config: SysioContracts.SysioSystemSnapConfigType = {
        min_providers: 3,
        block_spacing: 250
      },
      action: SysioContracts.SysioSystemSetsnpcfgAction = config,
      api = createMockApi([config]),
      system = contracts.sysio.getSysioContract(SysioContractName.system, {
        client: api
      })

    expect(system.actions.setsnpcfg.prepare(action)).toMatchObject({
      contract: SysioContractName.system,
      account: "sysio",
      name: "setsnpcfg",
      data: config
    })
    await expect(system.tables.snapconfig.first()).resolves.toEqual(config)
  })

  test("preserves seniority score weights in generated system action and table types", async () => {
    const weights: SysioContracts.SysioSystemProducerScoreConfigType = {
        snapshot_weight: 259_200,
        relay_weight: 0,
        api_weight: 0,
        benchmark_weight: 0,
        max_consecutive_missed_rounds: 3,
        snapshot_target_attestations: 1,
        min_blocks_per_round: 6,
        miss_penalty_sec: 604_800,
        seniority_base_sec: 604_800
      },
      action: SysioContracts.SysioSystemSetscorecfgAction = { weights },
      api = createMockApi([weights]),
      system = contracts.sysio.getSysioContract(SysioContractName.system, {
        client: api
      })

    expect(system.actions.setscorecfg.prepare(action)).toMatchObject({
      contract: SysioContractName.system,
      account: "sysio",
      name: "setscorecfg",
      data: action
    })
    await expect(system.tables.prodscorecfg.first()).resolves.toEqual(weights)
  })

  test("reads producer seniority and runtime state from generated system tables", async () => {
    const producer: SysioContracts.SysioSystemProducerInfoType = {
        owner: "produceraaaa",
        producer_key:
          "PUB_K1_7pyBBnwHmDD6tKMunrobP5mgbqWgei4GAx42c9Bof3kjSUdPTx",
        rank_score: "4611684901060608001",
        is_active: true,
        url: "",
        unpaid_blocks: 12,
        last_claim_time: "2026-11-04T00:00:00.000",
        location: 0,
        producer_authority: null,
        consecutive_missed_rounds: 0,
        is_demoted: false,
        snapshot_attestations: 1,
        snapshot_period: 1,
        last_paid_round: 40,
        service_sec: 7_200,
        registration_seq: 1
      },
      state: SysioContracts.SysioSystemProducerRuntimeStateType = {
        last_producer_schedule_update: "2026-11-04T00:00:00.000",
        last_producer_schedule_size: 21,
        last_producer: "produceraaaa",
        rescore_cursor: 0,
        rescore_pending: false,
        round_start_block: 1_200,
        last_registration_seq: 21
      },
      producers = contracts.sysio.getSysioContract(SysioContractName.system, {
        client: createMockApi([producer])
      }),
      runtime = contracts.sysio.getSysioContract(SysioContractName.system, {
        client: createMockApi([state])
      })

    await expect(producers.tables.producers.first()).resolves.toEqual(producer)
    await expect(runtime.tables.prodstate.first()).resolves.toEqual(state)
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

  test("exposes the sysio.kicker action and table surface", async () => {
    const rows: SysioContracts.SysioKickerKickPoolType[] = [
        {
          sym: "LIQSOL",
          rate_bps: 200,
          min_gift: 1_000,
          last_kick: "2026-01-01T00:00:00",
          gifted_total: "0",
          shortfall_amount: 0,
          shortfall_time: "1970-01-01T00:00:00",
          gift_overflow: false,
          spot_deviation: false,
          max_gift_per_day: 0,
          day: 0,
          spent_today: "0",
          supply_snapshot: "9007199254740993",
          price_snapshot: { lo: "0", hi: "0" },
          price_time: "2026-01-01T00:00:00"
        }
      ],
      api = createMockApi(rows),
      kicker = contracts.sysio.getSysioContract(SysioContractName.kicker, {
        client: api
      }),
      data: SysioContracts.SysioKickerKickAction = { sym: "LIQSOL" }

    expect(kicker.account).toBe("sysio.kicker")
    expect(kicker.actions.kick.prepare(data)).toMatchObject({
      account: "sysio.kicker",
      name: "kick",
      data
    })
    await expect(kicker.tables.kickpools.first()).resolves.toEqual(rows[0])
    expect(api.v1.chain.get_table_rows).toHaveBeenCalledWith(
      expect.objectContaining({ code: "sysio.kicker", table: "kickpools" })
    )
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

  test("reads the sysio.msgch outbound queue as typed rows", async () => {
    const row: SysioContracts.SysioMsgchOutboundQueueEntryType = {
        chain_code: 42,
        queued: 3
      },
      api = createMockApi([row]),
      msgch = contracts.sysio.getSysioContract(SysioContractName.msgch, {
        client: api
      }),
      result = await msgch.tables.outqueue.query(),
      rows: SysioContracts.SysioMsgchOutboundQueueEntryType[] = result.rows

    expect(
      SysioContracts.SysioContractDefinitions[SysioContractName.msgch].tables
    ).toContain("outqueue")
    expect(rows).toEqual([row])
    expect(api.v1.chain.get_table_rows).toHaveBeenCalledWith({
      code: "sysio.msgch",
      table: "outqueue",
      scope: "sysio.msgch",
      json: true
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

/** One `sysio.system::epochlog` row as the node's JSON encodes it: `batch_history_complete` is 0 or 1. */
function epochLogWireRow(
  sysioEpochIndex: number,
  batchHistoryComplete: unknown
) {
  return {
    sysio_epoch_index: sysioEpochIndex,
    epoch_count: sysioEpochIndex,
    timestamp: "2026-11-20T00:00:00.000",
    total_emission: 1_000,
    compute_amount: 600,
    capex_amount: 200,
    governance_amount: 100,
    batch_history_complete: batchHistoryComplete,
    batch_emission_retained: 0
  }
}

/** An `epochlog` value the node could not ABI-decode, returned as the hex of its bytes. */
const UndecodedEpochLogValue = "29000000000000002900000000000000"

/** One endpoint table transport and the cursor it returns for a page. */
interface TableTransportCase {
  /** Transport the API client is configured for. */
  format: API.v1.TableRowsFormat
  /** Wraps one node row value in the transport's row envelope. */
  wrap: (value: unknown, index: number) => unknown
  /** `next_key` as the endpoint returns it. */
  cursor: string
  /** `next_key` as the API client returns it, in string form. */
  nextKey: string
}

/** One `sysio.opreg::operators` row as the node's JSON encodes it, with nested action-log flags. */
function operatorWireRow(isBootstrapped: number, successes: unknown[]) {
  return {
    account: "batchop.a",
    type: "OPERATOR_TYPE_BATCH",
    status: "OPERATOR_STATUS_ACTIVE",
    is_bootstrapped: isBootstrapped,
    balances: [],
    registered_at: 1,
    available_at: 1,
    updated_at: 1,
    terminated_at: 0,
    status_reason: "",
    recent_actions: successes.map((success, index) => ({
      action: { action_type: "ACTION_TYPE_DEPOSIT" },
      success,
      timestamp: { value: index },
      error_message: ""
    }))
  }
}

describe("system contract table rows", () => {
  test("returns complete (1) and incomplete (0) epochlog rows with a boolean flag", async () => {
    const complete = epochLogWireRow(41, 1),
      incomplete = epochLogWireRow(42, 0),
      system = contracts.sysio.getSysioContract(SysioContractName.system, {
        client: createMockApi([complete, incomplete])
      }),
      result = await system.tables.epochlog.query(),
      rows: SysioContracts.SysioSystemEpochLogType[] = result.rows

    expect(rows.map(row => row.batch_history_complete)).toEqual([true, false])
    expect(rows[0].batch_history_complete === true).toBe(true)
    expect(rows[1].batch_history_complete === false).toBe(true)
    expect(rows[0]).toEqual({ ...complete, batch_history_complete: true })
    expect(rows[1]).toEqual({ ...incomplete, batch_history_complete: false })
    expect(complete.batch_history_complete).toBe(1)
    await expect(system.tables.epochlog.first()).resolves.toMatchObject({
      batch_history_complete: true
    })
  })

  test("converts top-level and nested array bool fields of another table", async () => {
    const opreg = contracts.sysio.getSysioContract(SysioContractName.opreg, {
        client: createMockApi([
          operatorWireRow(1, [1, 0]),
          operatorWireRow(0, [])
        ])
      }),
      rows: SysioContracts.SysioOpregOperatorEntryType[] = (
        await opreg.tables.operators.rows()
      ).rows

    expect(rows.map(row => row.is_bootstrapped)).toEqual([true, false])
    expect(rows[0].recent_actions.map(action => action.success)).toEqual([
      true,
      false
    ])
    expect(rows[0].recent_actions[0].timestamp).toEqual({ value: 0 })
    expect(rows[1].recent_actions).toEqual([])
  })

  test("keeps JSON booleans, absent fields, and the response envelope unchanged", async () => {
    const api = createMockApi(),
      epoch = contracts.sysio.getSysioContract(SysioContractName.epoch, {
        client: api
      })
    api.v1.chain.get_table_rows.mockResolvedValueOnce({
      rows: [{ current_epoch_index: 7 }, { is_paused: true }],
      more: true,
      next_key: "8",
      ram_payers: ["alice", "bob"]
    })

    const result = await epoch.tables.epochstate.query({ show_payer: true })

    expect(result).toEqual({
      rows: [{ current_epoch_index: 7 }, { is_paused: true }],
      more: true,
      next_key: "8",
      ram_payers: ["alice", "bob"]
    })
    expect(result.rows[0]).not.toHaveProperty("is_paused")
  })

  test("leaves rows of tables without bool fields and binary rows untouched", async () => {
    const row = { chain_code: 42, queued: 3 },
      msgch = contracts.sysio.getSysioContract(SysioContractName.msgch, {
        client: createMockApi([row])
      }),
      binary = contracts.sysio.getSysioContract(SysioContractName.system, {
        client: createMockApi(["00ff"])
      })

    expect((await msgch.tables.outqueue.query()).rows[0]).toBe(row)
    await expect(
      binary.tables.epochlog.query({ json: false })
    ).resolves.toMatchObject({ rows: ["00ff"] })
  })

  test("rejects a value that is not an ABI bool encoding, naming the field", async () => {
    const system = contracts.sysio.getSysioContract(SysioContractName.system, {
        client: createMockApi([epochLogWireRow(43, 2)])
      }),
      quoted = contracts.sysio.getSysioContract(SysioContractName.system, {
        client: createMockApi([epochLogWireRow(44, "1")])
      }),
      opreg = contracts.sysio.getSysioContract(SysioContractName.opreg, {
        client: createMockApi([operatorWireRow(1, [1, "1"])])
      })

    await expect(system.tables.epochlog.query()).rejects.toThrow(
      /ABI bool value is not 0, 1, false or true.*sysio\.system::epochlog\.batch_history_complete/
    )
    await expect(quoted.tables.epochlog.query()).rejects.toThrow(
      /sysio\.system::epochlog\.batch_history_complete/
    )
    await expect(opreg.tables.operators.query()).rejects.toThrow(
      /sysio\.opreg::operators\.recent_actions\[1\]\.success/
    )
  })

  test.each<TableTransportCase>([
    {
      format: API.v1.TableRowsFormat.wireKv,
      wrap: (value, index) => ({
        key: { sysio_epoch_index: 41 + index },
        value,
        payer: "sysio"
      }),
      cursor: '{"sysio_epoch_index":45}',
      nextKey: '{"sysio_epoch_index":45}'
    },
    {
      format: API.v1.TableRowsFormat.legacyPayer,
      wrap: value => ({ data: value, payer: "sysio" }),
      cursor: "45",
      nextKey: String(Name.from(UInt64.from(45)))
    }
  ])(
    "keeps undecoded rows, and the page cursor, of a mixed $format page",
    async ({ format, wrap, cursor, nextKey }) => {
      const complete = epochLogWireRow(41, 1),
        incomplete = epochLogWireRow(43, 0),
        values = [complete, UndecodedEpochLogValue, incomplete, ""],
        call = jest.fn(async () => ({
          status: 200,
          headers: {},
          text: "",
          json: { rows: values.map(wrap), more: true, next_key: cursor }
        })),
        system = contracts.sysio.getSysioContract(SysioContractName.system, {
          client: new APIClient({ provider: { call }, tableRowsFormat: format })
        }),
        page = await system.tables.epochlog.query({ show_payer: true })

      expect(page.rows).toEqual([
        { ...complete, batch_history_complete: true },
        UndecodedEpochLogValue,
        { ...incomplete, batch_history_complete: false },
        ""
      ])
      expect(page.more).toBe(true)
      expect(String(page.next_key)).toBe(nextKey)
      expect(page.ram_payers.map(String)).toEqual(values.map(() => "sysio"))
      expect(call).toHaveBeenCalledTimes(1)
    }
  )

  test("returns a falsy first row as is, and null for an empty page", async () => {
    const undecoded = contracts.sysio.getSysioContract(
        SysioContractName.system,
        { client: createMockApi([""]) }
      ),
      empty = contracts.sysio.getSysioContract(SysioContractName.system, {
        client: createMockApi([])
      })

    await expect(undecoded.tables.epochlog.first()).resolves.toBe("")
    await expect(empty.tables.epochlog.first()).resolves.toBeNull()
  })
})
