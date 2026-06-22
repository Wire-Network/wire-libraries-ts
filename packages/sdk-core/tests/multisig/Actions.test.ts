import { Checksum256 } from "@wireio/sdk-core/chain/Checksum"
import { Transaction } from "@wireio/sdk-core/chain/Transaction"
import { Msig } from "@wireio/sdk-core"

const {
  buildApproveAction,
  buildCancelAction,
  buildExecAction,
  buildGetProposalAction,
  buildInvalidateAction,
  buildProposeAction,
  buildUnapproveAction,
  MsigApprove,
  MsigCancel,
  MsigExec,
  MsigGetProposal,
  MsigInvalidate,
  MsigPropose,
  MsigUnapprove
} = Msig

function transaction(): Transaction {
  return Transaction.from({
    expiration: "2026-06-16T16:00:00",
    ref_block_num: 1,
    ref_block_prefix: 2,
    context_free_actions: [],
    actions: [],
    transaction_extensions: []
  })
}

describe("msig action builders", () => {
  test("builds propose with proposer authorization and requested approvals", () => {
    const action = buildProposeAction({
        proposer: "alice",
        proposalName: "upgrade1",
        requested: ["bob@active"],
        transaction: transaction()
      }),
      data = action.decodeData(MsigPropose)

    expect(action.account.toString()).toBe("sysio.msig")
    expect(action.name.toString()).toBe("propose")
    expect(action.authorization.map(String)).toEqual(["alice@active"])
    expect(data.proposer.toString()).toBe("alice")
    expect(data.proposal_name.toString()).toBe("upgrade1")
    expect(data.requested.map(String)).toEqual(["bob@active"])
    expect(data.trx.expiration.toString()).toBe("2026-06-16T16:00:00")
  })

  test("builds approve with signer authorization and proposal hash extension", () => {
    const hash = Checksum256.hash(new Uint8Array([1, 2, 3])),
      action = buildApproveAction({
        proposer: "alice",
        proposalName: "upgrade1",
        level: "bob@active",
        proposalHash: hash
      }),
      data = action.decodeData(MsigApprove)

    expect(action.account.toString()).toBe("sysio.msig")
    expect(action.name.toString()).toBe("approve")
    expect(action.authorization.map(String)).toEqual(["bob@active"])
    expect(data.proposer.toString()).toBe("alice")
    expect(data.proposal_name.toString()).toBe("upgrade1")
    expect(data.level.toString()).toBe("bob@active")
    expect(data.proposal_hash!.equals(hash)).toBe(true)
  })

  test("builds unapprove with signer authorization", () => {
    const action = buildUnapproveAction({
        proposer: "alice",
        proposalName: "upgrade1",
        level: "bob@active"
      }),
      data = action.decodeData(MsigUnapprove)

    expect(action.name.toString()).toBe("unapprove")
    expect(action.authorization.map(String)).toEqual(["bob@active"])
    expect(data.proposer.toString()).toBe("alice")
    expect(data.proposal_name.toString()).toBe("upgrade1")
    expect(data.level.toString()).toBe("bob@active")
  })

  test("builds cancel with canceler authorization", () => {
    const action = buildCancelAction({
        proposer: "alice",
        proposalName: "upgrade1",
        canceler: "alice"
      }),
      data = action.decodeData(MsigCancel)

    expect(action.name.toString()).toBe("cancel")
    expect(action.authorization.map(String)).toEqual(["alice@active"])
    expect(data.proposer.toString()).toBe("alice")
    expect(data.proposal_name.toString()).toBe("upgrade1")
    expect(data.canceler.toString()).toBe("alice")
  })

  test("builds exec with executer authorization", () => {
    const action = buildExecAction({
        proposer: "alice",
        proposalName: "upgrade1",
        executer: "alice"
      }),
      data = action.decodeData(MsigExec)

    expect(action.name.toString()).toBe("exec")
    expect(action.authorization.map(String)).toEqual(["alice@active"])
    expect(data.proposer.toString()).toBe("alice")
    expect(data.proposal_name.toString()).toBe("upgrade1")
    expect(data.executer.toString()).toBe("alice")
  })

  test("builds invalidate with account active authorization", () => {
    const action = buildInvalidateAction({ account: "bob" }),
      data = action.decodeData(MsigInvalidate)

    expect(action.name.toString()).toBe("invalidate")
    expect(action.authorization.map(String)).toEqual(["bob@active"])
    expect(data.account.toString()).toBe("bob")
  })

  test("builds read-only getproposal without authorization", () => {
    const action = buildGetProposalAction("alice", "upgrade1"),
      data = action.decodeData(MsigGetProposal)

    expect(action.name.toString()).toBe("getproposal")
    expect(action.authorization.map(String)).toEqual([])
    expect(data.proposer.toString()).toBe("alice")
    expect(data.proposal_name.toString()).toBe("upgrade1")
  })
})
