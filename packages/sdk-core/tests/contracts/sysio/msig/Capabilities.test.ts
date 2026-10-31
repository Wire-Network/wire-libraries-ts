import { contracts } from "@wireio/sdk-core"
import { getLogger } from "@wireio/shared"

const { capabilitiesFromAbi, detectMsigCapabilities } = contracts.sysio.msig

const baseActions = ["propose", "approve", "unapprove", "cancel", "exec", "invalidate"],
  baseTables = ["proposal", "approvals2", "approvals", "invals"]

function action(name: string, type = name): { name: string; type: string } {
  return { name, type }
}

function table(name: string): { name: string; type: string } {
  return { name, type: name }
}

function field(name: string, type = "name"): { name: string; type: string } {
  return { name, type }
}

function legacyAbi(): any {
  return {
    actions: baseActions.map(name => action(name)),
    tables: baseTables.map(table),
    structs: [
      {
        name: "proposal",
        fields: [
          field("proposal_name"),
          field("packed_transaction", "bytes"),
          field("earliest_exec_time", "time_point")
        ]
      },
      {
        name: "approve",
        fields: [
          field("proposer"),
          field("proposal_name"),
          field("level", "permission_level")
        ]
      }
    ]
  }
}

function chunkedAbi(): any {
  return {
    ...legacyAbi(),
    actions: [...baseActions.map(name => action(name)), action("getproposal")],
    tables: [...baseTables.map(table), table("propchunks")],
    action_results: [{ name: "getproposal", result_type: "proposal" }],
    structs: [
      {
        name: "proposal",
        fields: [
          field("proposal_name"),
          field("packed_transaction", "bytes"),
          field("earliest_exec_time", "time_point"),
          field("chunk_count", "uint32"),
          field("total_size", "uint32"),
          field("trx_hash", "checksum256")
        ]
      },
      {
        name: "approve",
        fields: [
          field("proposer"),
          field("proposal_name"),
          field("level", "permission_level"),
          field("proposal_hash", "checksum256$")
        ]
      },
      {
        name: "getproposal",
        fields: [field("proposer"), field("proposal_name")]
      }
    ]
  }
}

describe("msig capabilities", () => {
  test("logs the original ABI failure while returning diagnostic unknown capabilities", async () => {
    const failure = new Error("ABI service unavailable"),
      logger = getLogger(
        require.resolve("@wireio/sdk-core/contracts/sysio/msig/Capabilities")
      ),
      warn = jest.spyOn(logger, "warn").mockImplementation(() => {}),
      client = {
        v1: { chain: { get_abi: jest.fn().mockRejectedValue(failure) } }
      }
    try {
      expect((await detectMsigCapabilities(client as any)).profile).toBe("unknown")
      expect(warn).toHaveBeenCalledWith(
        "Multisig ABI capability detection failed: %s",
        String(failure)
      )
    } finally {
      warn.mockRestore()
    }
  })

  test("classifies current legacy sysio.msig as legacy table readable", () => {
    const capabilities = capabilitiesFromAbi({ abi: legacyAbi() })

    expect(capabilities.profile).toBe("legacy")
    expect(capabilities.readStrategy).toBe("legacy-table")
    expect(capabilities.supports.legacyTableRead).toBe(true)
    expect(capabilities.supports.readOnlyGetProposal).toBe(false)
    expect(capabilities.missingEnhanced).toEqual(
      expect.arrayContaining([
        "action:getproposal",
        "action_result:getproposal",
        "table:propchunks",
        "field:proposal.chunk_count",
        "field:proposal.total_size",
        "field:proposal.trx_hash",
        "field:approve.proposal_hash"
      ])
    )
  })

  test("classifies chunked getproposal ABI as chunked-v2", () => {
    const capabilities = capabilitiesFromAbi({ abi: chunkedAbi() })

    expect(capabilities.profile).toBe("chunked-v2")
    expect(capabilities.readStrategy).toBe("read-only-getproposal")
    expect(capabilities.missingRequired).toEqual([])
    expect(capabilities.missingEnhanced).toEqual([])
    expect(capabilities.supports.chunkedProposals).toBe(true)
    expect(capabilities.supports.proposalHash).toBe(true)
    expect(capabilities.supports.approveProposalHash).toBe(true)
  })

  test("returns unknown when ABI is not available", () => {
    const capabilities = capabilitiesFromAbi(null)

    expect(capabilities.profile).toBe("unknown")
    expect(capabilities.readStrategy).toBe("legacy-table")
    expect(capabilities.missingRequired).toEqual(["abi"])
  })
})
