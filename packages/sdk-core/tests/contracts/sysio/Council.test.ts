import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  ABI,
  Action,
  contracts,
  Serializer,
  SysioContracts
} from "@wireio/sdk-core"

/** Actual CDT-generated council ABI, copied from the WIRE-418 contract build. */
const councilAbi = ABI.from(
  readFileSync(join(__dirname, "fixtures", "sysio.councl.abi"), "utf8")
)
const council = contracts.sysio.getSysioContract(
  SysioContracts.SysioContractName.councl
)
const voter = "alice"
const identity = {
  election_gen: "9007199254740993",
  round_id: "9007199254740995"
}
const flightHash = "ab".repeat(32)
const seatCount = 21
const authorization = [`${voter}@active`]

describe("generated council round interface", () => {
  test("serializes all 63 candidate decisions and exact signed identities", () => {
    const data = {
      voter,
      ...identity,
      flight_hash: flightHash,
      votes: Array.from({ length: seatCount }, (_, seat) => ({
        seat,
        v1: true,
        v2: seat % 2 === 0,
        v3: false
      }))
    } satisfies SysioContracts.SysioCounclVoteAction
    const prepared = council.actions.vote.prepare(data, {
      abi: councilAbi,
      authorization
    })

    expect(prepared).toBeInstanceOf(Action)
    if (!(prepared instanceof Action)) {
      throw new Error(
        "Council ballot unexpectedly fell back to an unencoded action"
      )
    }
    expect(Serializer.objectify(prepared.decodeData(councilAbi))).toEqual(data)
    expect(prepared.authorization.map(String)).toEqual(authorization)
  })

  test("preserves required identities through the deployed-ABI fallback", () => {
    const data = {
      voter,
      ...identity,
      flight_hash: flightHash,
      votes: [{ seat: 1, v1: true, v2: true, v3: true }]
    } satisfies SysioContracts.SysioCounclVoteAction
    const prepared = council.actions.vote.prepare(data, { authorization })

    expect(prepared).not.toBeInstanceOf(Action)
    expect(prepared).toMatchObject({ data })
    const encoded = Action.from(prepared, councilAbi)
    expect(encoded.authorization.map(String)).toEqual(authorization)
    expect(Serializer.objectify(encoded.decodeData(councilAbi))).toEqual(data)
  })

  test("encodes nominations and bounded cranks using generated actions", () => {
    const nomination = {
      proposer: voter,
      c1: "bob",
      c2: "carol",
      c3: "dave",
      ...identity
    } satisfies SysioContracts.SysioCounclRepcandidateAction
    const settlement = {
      caller: voter,
      ...identity,
      max_steps: seatCount
    } satisfies SysioContracts.SysioCounclSettleAction
    const options = { abi: councilAbi, authorization }
    const prepared = [
      [council.actions.repcandidate.prepare(nomination, options), nomination],
      [council.actions.settle.prepare(settlement, options), settlement]
    ] as const

    prepared.forEach(([action, expected]) => {
      expect(action).toBeInstanceOf(Action)
      if (!(action instanceof Action)) {
        throw new Error(
          "Council action unexpectedly fell back to an unencoded action"
        )
      }
      expect(Serializer.objectify(action.decodeData(councilAbi))).toEqual(
        expected
      )
    })
  })

  test("decodes round ballot counters from the generated state ABI", () => {
    const state = {
      phase: SysioContracts.SysioCounclElectionPhase.VOTING,
      round_id: identity.round_id,
      round_open_ts: "2026-10-08T00:00:00.000",
      vote_deadline: "2026-10-08T01:00:00.000",
      cursor: 0,
      seats_filled: 16,
      t1_ballots: 21,
      t2_ballots: 30,
      t3_ballots: 100,
      flight_hash: flightHash,
      round_seed: flightHash,
      acc: flightHash,
      stir_count: "151"
    } satisfies SysioContracts.SysioCounclElectionStateType
    const encoded = Serializer.encode({
      object: state,
      type: "election_state",
      abi: councilAbi
    })
    const decoded = Serializer.objectify(
      Serializer.decode({
        data: encoded,
        type: "election_state",
        abi: councilAbi
      })
    )

    expect(decoded).toMatchObject({
      round_id: state.round_id,
      seats_filled: state.seats_filled,
      t1_ballots: state.t1_ballots,
      t2_ballots: state.t2_ballots,
      t3_ballots: state.t3_ballots
    })
    expect(decoded).not.toHaveProperty("backstop_mask")
  })

  test("exposes only vote-based seating through the generated action surface", () => {
    const definition =
      SysioContracts.SysioContractDefinitions[
        SysioContracts.SysioContractName.councl
      ]
    expect(definition.actions).not.toContain("forceback")
    expect(definition.actions).not.toContain("forceassign")
    expect(councilAbi.actions.map(action => String(action.name))).toEqual(
      definition.actions
    )
  })
})
