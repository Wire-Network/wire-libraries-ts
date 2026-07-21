import { contracts, SysioContracts } from "@wireio/sdk-core"

interface ProposalContractActions {
  approve: SysioContracts.SysioMsigApproveAction
}

interface ProposalContractTables {
  proposal: SysioContracts.SysioMsigProposalType
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
})
