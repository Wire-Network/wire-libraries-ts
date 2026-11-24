import { contracts, SysioContracts } from "@wireio/sdk-core"

const { SysioContractName, SysioContractDefinitions } = SysioContracts,
  { normalizeSysioTableRow } = contracts.sysio

/** One `sysio.councl::ballots` row as the node's JSON encodes it: each vote's flags are 0 or 1. */
const BallotWireRow = {
  voter: "voter.a",
  round_id: 3,
  tier: "T1",
  flight_hash: "00",
  votes: [
    { seat: 1, v1: 1, v2: 0, v3: 1 },
    { seat: 2, v1: 0, v2: 1, v3: 0 }
  ]
}

describe("normalizeSysioTableRow", () => {
  test("converts bool fields inside arrays of structs without mutating the row", () => {
    const row = normalizeSysioTableRow(
      SysioContractName.councl,
      "ballots",
      BallotWireRow
    )

    expect(row.votes).toEqual([
      { seat: 1, v1: true, v2: false, v3: true },
      { seat: 2, v1: false, v2: true, v3: false }
    ])
    expect(row.voter).toBe("voter.a")
    expect(BallotWireRow.votes[0].v1).toBe(1)
  })

  test("returns rows of tables without bool fields as they are", () => {
    const row = { chain_code: 42, queued: 3 }

    expect(
      SysioContractDefinitions[SysioContractName.msgch].tableBooleans.outqueue
    ).toBeUndefined()
    expect(
      normalizeSysioTableRow(SysioContractName.msgch, "outqueue", row)
    ).toBe(row)
  })

  test("passes null values through and keeps already-boolean values", () => {
    expect(
      normalizeSysioTableRow(SysioContractName.andon, "cord", null)
    ).toBeNull()
    expect(
      normalizeSysioTableRow(SysioContractName.andon, "cord", {
        pulled: false,
        when: "2026-11-20T00:00:00",
        reason: ""
      }).pulled
    ).toBe(false)
    expect(
      normalizeSysioTableRow(SysioContractName.councl, "ballots", {
        ...BallotWireRow,
        votes: null
      }).votes
    ).toBeNull()
  })

  test("rejects values whose JSON kind contradicts the ABI type", () => {
    expect(() =>
      normalizeSysioTableRow(SysioContractName.andon, "cord", "0001")
    ).toThrow(/ABI struct value is not a JSON object.*sysio\.andon::cord/)
    expect(() =>
      normalizeSysioTableRow(SysioContractName.councl, "ballots", {
        ...BallotWireRow,
        votes: { v1: 1 }
      })
    ).toThrow(
      /ABI array value is not a JSON array.*sysio\.councl::ballots\.votes/
    )
    expect(() =>
      normalizeSysioTableRow(SysioContractName.andon, "cord", {
        pulled: "true"
      })
    ).toThrow(
      /ABI bool value is not 0, 1, false or true.*sysio\.andon::cord\.pulled/
    )
  })

  test("describes only tables that each contract defines", () => {
    Object.values(SysioContractDefinitions).forEach(definition => {
      Object.keys(definition.tableBooleans).forEach(table => {
        expect(definition.tables).toContain(table)
      })
    })
    expect(
      SysioContractDefinitions[SysioContractName.system].tableBooleans.epochlog
    ).toEqual({
      kind: SysioContracts.SysioBooleanDescriptorKind.struct,
      fields: {
        batch_history_complete: {
          kind: SysioContracts.SysioBooleanDescriptorKind.boolean
        }
      }
    })
  })
})
