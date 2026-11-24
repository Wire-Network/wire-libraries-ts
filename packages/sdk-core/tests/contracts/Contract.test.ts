import { API, contracts, SysioContracts } from "@wireio/sdk-core"

interface ProposalContractActions {
  approve: SysioContracts.SysioMsigApproveAction
}

interface ProposalContractTables {
  proposal: SysioContracts.SysioMsigProposalType
}

interface FlagContractTables {
  flag: boolean
}

/** Minimal fixture for the standalone descriptor-backed contract client. */
const ProposalContractDescriptor: contracts.ContractDescriptor<
  ProposalContractActions,
  ProposalContractTables
> = {
  account: "sysio.msig",
  actions: {
    approve: {
      name: "approve",
      serialize: data => contracts.sysio.msig.MsigApprove.from(data)
    }
  },
  tables: {
    proposal: {
      name: "proposal",
      rowType: null
    }
  }
}

/** Creates the API surface used by the generic contract client. */
function mockApi(rows: unknown[] = []) {
  return {
    v1: {
      chain: {
        get_table_rows: jest.fn(async () => ({ rows, more: false })),
        get_table_by_scope: jest.fn(async () => ({
          rows: [{ scope: "alice" }],
          more: ""
        }))
      }
    }
  } as any
}

describe("generic contract client", () => {
  test("builds encoded actions from a typed descriptor", () => {
    const client = contracts.createContractClient({
        client: mockApi(),
        descriptor: ProposalContractDescriptor
      }),
      action = client.actions.approve(
        {
          proposer: "alice",
          proposal_name: "upgrade1",
          level: { actor: "bob", permission: "active" },
          proposal_hash: null
        },
        ["bob@active"]
      ),
      decoded = action.decodeData(contracts.sysio.msig.MsigApprove)

    expect(action.account.toString()).toBe("sysio.msig")
    expect(action.name.toString()).toBe("approve")
    expect(action.authorization.map(String)).toEqual(["bob@active"])
    expect(decoded.proposer.toString()).toBe("alice")
    expect(decoded.proposal_name.toString()).toBe("upgrade1")
  })

  test("reads typed rows and the first matching row", async () => {
    const row: SysioContracts.SysioMsigProposalType = {
        proposal_name: "upgrade1",
        packed_transaction: "",
        earliest_exec_time: null,
        chunk_count: null,
        total_size: null,
        trx_hash: null
      },
      api = mockApi([row]),
      client = contracts.createContractClient({
        client: api,
        descriptor: ProposalContractDescriptor
      }),
      result = await client.tables.proposal.rows({
        scope: "alice",
        limit: 5
      }),
      first = await client.tables.proposal.first({ scope: "alice" })

    expect(result.rows).toEqual([row])
    expect(first).toEqual(row)
    expect(api.v1.chain.get_table_rows).toHaveBeenCalledWith({
      code: "sysio.msig",
      table: "proposal",
      scope: "alice",
      json: true,
      limit: 5
    })
  })

  test("lists table scopes", async () => {
    const api = mockApi(),
      client = contracts.createContractClient({
        client: api,
        descriptor: ProposalContractDescriptor
      })

    await expect(client.table("proposal").scopes()).resolves.toEqual(["alice"])
    expect(api.v1.chain.get_table_by_scope).toHaveBeenCalledWith({
      code: "sysio.msig",
      table: "proposal"
    })
  })

  test("decodes JSON rows with the table descriptor's deserializer", async () => {
    const deserialize = jest.fn((row: unknown) => ({
        ...(row as SysioContracts.SysioMsigProposalType),
        proposal_name: "decoded"
      })),
      descriptor: contracts.ContractDescriptor<
        ProposalContractActions,
        ProposalContractTables
      > = {
        ...ProposalContractDescriptor,
        tables: { proposal: { name: "proposal", rowType: null, deserialize } }
      },
      client = contracts.createContractClient({
        client: mockApi([{ proposal_name: "upgrade1" }]),
        descriptor
      })

    await expect(client.tables.proposal.rows()).resolves.toEqual({
      rows: [{ proposal_name: "decoded" }],
      more: false
    })
    await expect(client.tables.proposal.first()).resolves.toEqual({
      proposal_name: "decoded"
    })
    await expect(client.tables.proposal.rows({ json: false })).resolves.toEqual(
      { rows: [{ proposal_name: "upgrade1" }], more: false }
    )
    expect(deserialize).toHaveBeenCalledTimes(2)
  })

  test("returns boolean sysio.chains registry flags through the published descriptor", async () => {
    const client = contracts.createContractClient({
        client: mockApi([
          { code: "WIRE", is_depot: 1, active: 1 },
          { code: "SOLANA", is_depot: 0, active: 0 }
        ]),
        descriptor: contracts.sysio.chains.descriptor
      }),
      rows: SysioContracts.SysioChainsChainRowType[] = (
        await client.tables.chains.rows()
      ).rows

    expect(rows.map(row => [row.is_depot, row.active])).toEqual([
      [true, true],
      [false, false]
    ])
  })

  test("keeps undecoded rows, and the page cursor, around the published descriptor's deserializer", async () => {
    const api = mockApi(),
      client = contracts.createContractClient({
        client: api,
        descriptor: contracts.sysio.chains.descriptor
      })
    api.v1.chain.get_table_rows.mockResolvedValueOnce({
      rows: [{ code: "WIRE", is_depot: 1, active: 1 }, "0a1b", ""],
      more: true,
      next_key: "SOLANA",
      ram_payers: ["sysio", "sysio", "sysio"]
    })

    await expect(
      client.tables.chains.rows({ show_payer: true })
    ).resolves.toEqual({
      rows: [{ code: "WIRE", is_depot: true, active: true }, "0a1b", ""],
      more: true,
      next_key: "SOLANA",
      ram_payers: ["sysio", "sysio", "sysio"]
    })
  })

  test("returns the first row as is, even when falsy, and null for an empty page", async () => {
    const descriptor: contracts.ContractDescriptor<
        ProposalContractActions,
        FlagContractTables
      > = {
        account: "sysio.msig",
        actions: ProposalContractDescriptor.actions,
        tables: {
          flag: { name: "flag", rowType: null, deserialize: row => row === 1 }
        }
      },
      unset = contracts.createContractClient({
        client: mockApi([0]),
        descriptor
      }),
      empty = contracts.createContractClient({
        client: mockApi([]),
        descriptor
      }),
      undecoded = contracts.createContractClient({
        client: mockApi([""]),
        descriptor: ProposalContractDescriptor
      })

    await expect(unset.tables.flag.first()).resolves.toBe(false)
    await expect(empty.tables.flag.first()).resolves.toBeNull()
    await expect(undecoded.tables.proposal.first()).resolves.toBe("")
  })
})

describe("deserializeTableRows", () => {
  /** A page mixing ABI-decoded rows with rows the node returned as hex. */
  const MixedPage: API.v1.GetTableRowsResponse<string> = {
    rows: [{ id: 1 }, "00ff", "", { id: 2 }],
    more: true,
    next_key: "3"
  }

  test("decodes only ABI-decoded rows and keeps the rest of the page", () => {
    const deserialize = jest.fn((row: unknown) => ({
        ...(row as Record<string, number>),
        decoded: true
      })),
      expected = {
        ...MixedPage,
        rows: [{ id: 1, decoded: true }, "00ff", "", { id: 2, decoded: true }]
      }

    expect(
      contracts.deserializeTableRows(MixedPage, undefined, deserialize)
    ).toEqual(expected)
    expect(
      contracts.deserializeTableRows(MixedPage, true, deserialize)
    ).toEqual(expected)
    expect(deserialize.mock.calls.map(([row]) => row)).toEqual([
      { id: 1 },
      { id: 2 },
      { id: 1 },
      { id: 2 }
    ])
  })

  test("passes a string that is not the node's hex encoding to the decoder", () => {
    const deserialize = jest.fn((row: unknown) => `decoded ${row}`)

    expect(
      contracts.deserializeTableRows(
        { rows: ["0x00ff", "abc", "zz"], more: false },
        true,
        deserialize
      ).rows
    ).toEqual(["decoded 0x00ff", "decoded abc", "decoded zz"])
  })

  test("returns a json: false page untouched", () => {
    const deserialize = jest.fn()

    expect(contracts.deserializeTableRows(MixedPage, false, deserialize)).toBe(
      MixedPage
    )
    expect(deserialize).not.toHaveBeenCalled()
  })
})
