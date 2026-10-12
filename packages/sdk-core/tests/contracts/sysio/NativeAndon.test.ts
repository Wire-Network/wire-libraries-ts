import { Action, contracts, Serializer, SysioContracts } from "@wireio/sdk-core"
import { SysioAndonAbi } from "./fixtures/SysioAndonAbi.js"

const { SysioContractName, SysioContractDefinitions } = SysioContracts
const AndonAccount = "sysio.andon"
const PullReason = "test"
const ClearNote = "done"
const StringTestBytes = "0474657374"
const StringDoneBytes = "04646f6e65"

describe("Sysio #662 native Andon interface", () => {
  test("encodes pull with only its reason and explicit linked authorization", () => {
    const andon = contracts.sysio.getSysioContract(SysioContractName.andon)
    const prepared = andon.actions.pull.prepare(
      { reason: PullReason },
      { authorization: [`${AndonAccount}@pull`] }
    )
    const action = Action.from(prepared, SysioAndonAbi)
    expect(action.data.hexString).toBe(StringTestBytes)
    expect(action.authorization.map(String)).toEqual([`${AndonAccount}@pull`])
    expect(
      Serializer.decode({ data: action.data, abi: SysioAndonAbi, type: "pull" })
    ).toMatchObject({ reason: PullReason })
  })

  test("encodes clear with only its note and does not invent authorization", () => {
    const andon = contracts.sysio.getSysioContract(SysioContractName.andon)
    const prepared = andon.actions.clear.prepare({ note: ClearNote })
    const action = Action.from(prepared, SysioAndonAbi)
    expect(action.data.hexString).toBe(StringDoneBytes)
    expect(action.authorization).toEqual([])
    expect(
      Serializer.decode({
        data: action.data,
        abi: SysioAndonAbi,
        type: "clear"
      })
    ).toMatchObject({ note: ClearNote })
  })

  test("accepts native cord fields and round trips the producer ABI", () => {
    const row: SysioContracts.SysioAndonCordStateType = {
      pulled: true,
      when: "2026-10-08T00:00:00.000",
      reason: PullReason
    }
    const encoded = Serializer.encode({
      object: row,
      abi: SysioAndonAbi,
      type: "cord_state"
    })
    const decoded = Serializer.decode({
      data: encoded,
      abi: SysioAndonAbi,
      type: "cord_state"
    })
    expect(JSON.parse(JSON.stringify(decoded))).toEqual(row)
  })

  test("exposes exactly the producer action and table names", () => {
    const definition = SysioContractDefinitions[SysioContractName.andon]
    expect(definition.actions).toEqual(
      SysioAndonAbi.actions.map(action => String(action.name))
    )
    expect(definition.tables).toEqual(
      SysioAndonAbi.tables.map(table => String(table.name))
    )
    const andon = contracts.sysio.getSysioContract(SysioContractName.andon)
    ;["setpanic", "addpuller"].forEach(name => {
      expect(() => Reflect.get(andon.actions, name)).toThrow(
        `Unknown sysio.andon action: ${name}`
      )
    })
    expect(() => Reflect.get(andon.tables, "andonconfig")).toThrow(
      "Unknown sysio.andon table: andonconfig"
    )
  })
})
