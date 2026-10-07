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

  test("encodes nominations, bounded cranks, and targeted recovery using generated actions", () => {
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
    const backstop = {
      seat: 20,
      ...identity
    } satisfies SysioContracts.SysioCounclForcebackAction
    const assignment = {
      ...backstop,
      member: "bob"
    } satisfies SysioContracts.SysioCounclForceassignAction
    const options = { abi: councilAbi, authorization }
    const prepared = [
      [council.actions.repcandidate.prepare(nomination, options), nomination],
      [council.actions.settle.prepare(settlement, options), settlement],
      [council.actions.forceback.prepare(backstop, options), backstop],
      [council.actions.forceassign.prepare(assignment, options), assignment]
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
})
