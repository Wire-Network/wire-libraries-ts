import { contracts, SlugName } from "@wireio/sdk-core"
import { SysioChainsChainkind } from "@wireio/sdk-core/types/SysioContractTypes"

const {
  ChainsActivateChain,
  ChainsRegisterChain,
  createActivateChainAction,
  createActivateChainActionData,
  createRegisterChainAction,
  createRegisterChainActionData
} = contracts.sysio.chains

const REGISTRATION = {
  kind: SysioChainsChainkind.CHAIN_KIND_EVM,
  code: "POLYGON",
  externalChainId: 137,
  name: "Polygon",
  description: "Polygon EVM outpost"
}

describe("sysio.chains action helpers", () => {
  test("creates generated register and activation action data", () => {
    expect(createRegisterChainActionData(REGISTRATION)).toEqual({
      kind: SysioChainsChainkind.CHAIN_KIND_EVM,
      code: { value: SlugName.from("POLYGON") },
      external_chain_id: 137,
      name: "Polygon",
      description: "Polygon EVM outpost"
    })
    expect(createActivateChainActionData("POLYGON")).toEqual({
      code: { value: SlugName.from("POLYGON") }
    })
  })

  test("serializes privileged actions through the shared contract proxy", () => {
    const register = createRegisterChainAction({
        registration: REGISTRATION,
        authorization: ["sysio.chains@active"]
      }),
      activate = createActivateChainAction({
        code: "POLYGON",
        authorization: ["sysio.chains@active"]
      }),
      registerData = register.decodeData(ChainsRegisterChain),
      activateData = activate.decodeData(ChainsActivateChain)

    expect(register.account.toString()).toBe("sysio.chains")
    expect(register.name.toString()).toBe("regchain")
    expect(register.authorization.map(String)).toEqual(["sysio.chains@active"])
    expect(Number(registerData.kind)).toBe(SysioChainsChainkind.CHAIN_KIND_EVM)
    expect(Number(registerData.code.value)).toBe(SlugName.from("POLYGON"))
    expect(Number(registerData.external_chain_id)).toBe(137)
    expect(registerData.name).toBe("Polygon")
    expect(registerData.description).toBe("Polygon EVM outpost")
    expect(Number(activateData.code.value)).toBe(SlugName.from("POLYGON"))
  })

  test("rejects external chain identifiers outside uint32", () => {
    expect(() =>
      createRegisterChainActionData({
        ...REGISTRATION,
        externalChainId: -1
      })
    ).toThrow("unsigned 32-bit integer")
    expect(() =>
      createRegisterChainActionData({
        ...REGISTRATION,
        externalChainId: 0x100000000
      })
    ).toThrow("unsigned 32-bit integer")
  })
})
