import { contracts } from "@wireio/sdk-core"

interface ProposalContractActions {}

interface ProposalContractTables {
  proposal: null
}

/** Minimal descriptor fixture for the standalone generic contract client. */
const ProposalContractDescriptor: contracts.ContractDescriptor<
  ProposalContractActions,
  ProposalContractTables
> = {
  account: "sysio.msig",
  actions: {},
  tables: {
    proposal: {
      name: "proposal",
      rowType: null
    }
  }
}

function mockApi(rows: unknown[] = []) {
  return {
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

describe("contract client factory", () => {
  test("builds typed actions from the generated system contract proxy", () => {
    const api = mockApi(),
      msig = contracts.sysio.createClient({
        client: api,
        name: "msig"
      }),
      action = msig.actions.approve(
        {
          proposer: "alice",
          proposal_name: "upgrade1",
          level: {
            actor: "bob",
            permission: "active"
          },
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
    expect(decoded.level.toString()).toBe("bob@active")
  })

  test("builds typed propose actions with generated transaction header fields", () => {
    const api = mockApi(),
      msig = contracts.sysio.createClient({
        client: api,
        name: "msig"
      }),
      action = msig.actions.propose(
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
        ["alice@active"]
      ),
      decoded = action.decodeData(contracts.sysio.msig.MsigPropose)

    expect(action.name.toString()).toBe("propose")
    expect(decoded.proposer.toString()).toBe("alice")
    expect(decoded.requested.map(String)).toEqual(["bob@active"])
    expect(decoded.trx.actions).toEqual([])
  })

  test("reads typed table rows from a generated system contract proxy", async () => {
    const row = {
        proposal_name: "upgrade1",
        packed_transaction: "",
        earliest_exec_time: null,
        chunk_count: null,
        total_size: null,
        trx_hash: null
      },
      api = mockApi([row]),
      msig = contracts.sysio.createClient({
        client: api,
        name: "msig"
      }),
      result = await msig.tables.proposal.rows({
        scope: "alice",
        limit: 5
      }),
      first = await msig.tables.proposal.first({
        scope: "alice"
      })

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

  test("lists scopes for descriptor table clients", async () => {
    const api = mockApi(),
      msig = contracts.createContractClient({
        client: api,
        descriptor: ProposalContractDescriptor
      }),
      scopes = await msig.table("proposal").scopes()

    expect(scopes).toEqual(["alice"])
    expect(api.v1.chain.get_table_by_scope).toHaveBeenCalledWith({
      code: "sysio.msig",
      table: "proposal"
    })
  })
})
