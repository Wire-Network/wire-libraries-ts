import { contracts } from "@wireio/sdk-core"

const { MsigApprovalsInfo, MsigProposal, getProposalStatus } = contracts.sysio.msig

describe("proposal status", () => {
  test("marks proposal fully approved when all requested approvals are provided", () => {
    const proposal = MsigProposal.from({
        proposal_name: "upgrade1",
        packed_transaction: ""
      }),
      approvals = MsigApprovalsInfo.from({
        version: 1,
        proposal_name: "upgrade1",
        requested_approvals: [
          {
            level: { actor: "bob", permission: "active" },
            time: "1970-01-01T00:00:00.000"
          }
        ],
        provided_approvals: [
          {
            level: { actor: "bob", permission: "active" },
            time: "2026-06-16T15:00:00.000"
          }
        ]
      }),
      status = getProposalStatus({
        proposal,
        approvals: { kind: "approvals2", approvals },
        transaction: null
      })

    expect(status.requested).toEqual(["bob@active"])
    expect(status.provided).toEqual(["bob@active"])
    expect(status.outstanding).toEqual([])
    expect(status.isFullyApprovedByRequestedList).toBe(true)
  })

  test("marks proposal fully approved when contract moves approval from requested to provided", () => {
    const proposal = MsigProposal.from({
        proposal_name: "upgrade1",
        packed_transaction: ""
      }),
      approvals = MsigApprovalsInfo.from({
        version: 1,
        proposal_name: "upgrade1",
        requested_approvals: [],
        provided_approvals: [
          {
            level: { actor: "bob", permission: "active" },
            time: "2026-06-16T15:00:00.000"
          }
        ]
      }),
      status = getProposalStatus({
        proposal,
        approvals: { kind: "approvals2", approvals },
        transaction: null
      })

    expect(status.requested).toEqual([])
    expect(status.provided).toEqual(["bob@active"])
    expect(status.outstanding).toEqual([])
    expect(status.isFullyApprovedByRequestedList).toBe(true)
  })
})
