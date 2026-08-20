import { contracts, SlugName } from "@wireio/sdk-core"
import { SysioChainsChainkind } from "@wireio/sdk-core/types/SysioContractTypes"

const {
  ChainsActivateChain,
  ChainsRegisterChain,
  ChainsSetOutpost,
  createActivateChainAction,
  createActivateChainActionData,
  createRegisterChainAction,
  createRegisterChainActionData,
  createSetOutpostAction,
  createSetOutpostActionData
} = contracts.sysio.chains

const EVM_OPP = "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  EVM_INBOUND = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  EVM_OPREG = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  EVM_DEPOSIT = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
  SVM_PROGRAM = "So11111111111111111111111111111111111111112",
  EMPTY_OUTPOST = {
    opp_addr: "",
    opp_inbound_addr: "",
    operator_registry_addr: "",
    source_deposit_addr: ""
  }

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
      description: "Polygon EVM outpost",
      // Registering before the remote contracts exist is legal; setoutpost
      // fills them in later, and both operator daemons skip the chain meanwhile.
      outpost: EMPTY_OUTPOST
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
    expect(registerData.outpost.opp_addr).toBe("")
    expect(Number(activateData.code.value)).toBe(SlugName.from("POLYGON"))
  })

  test("carries every EVM contract role through regchain", () => {
    expect(
      createRegisterChainActionData({
        ...REGISTRATION,
        outpost: {
          oppAddress: EVM_OPP,
          oppInboundAddress: EVM_INBOUND,
          operatorRegistryAddress: EVM_OPREG,
          sourceDepositAddress: EVM_DEPOSIT
        }
      }).outpost
    ).toEqual({
      opp_addr: EVM_OPP,
      opp_inbound_addr: EVM_INBOUND,
      operator_registry_addr: EVM_OPREG,
      source_deposit_addr: EVM_DEPOSIT
    })
  })

  test("defaults an omitted role to empty rather than dropping the field", () => {
    // An SVM outpost is one program: only opp_addr is set, and the protocol
    // REQUIRES the other three to be empty.
    expect(
      createSetOutpostActionData("SOLANA", { oppAddress: SVM_PROGRAM })
    ).toEqual({
      code: { value: SlugName.from("SOLANA") },
      outpost: { ...EMPTY_OUTPOST, opp_addr: SVM_PROGRAM }
    })
  })

  test("serializes setoutpost through the shared contract proxy", () => {
    const action = createSetOutpostAction({
        code: "POLYGON",
        outpost: {
          oppAddress: EVM_OPP,
          oppInboundAddress: EVM_INBOUND,
          operatorRegistryAddress: EVM_OPREG,
          sourceDepositAddress: EVM_DEPOSIT
        },
        authorization: ["sysio.chains@active"]
      }),
      data = action.decodeData(ChainsSetOutpost)

    expect(action.account.toString()).toBe("sysio.chains")
    expect(action.name.toString()).toBe("setoutpost")
    expect(Number(data.code.value)).toBe(SlugName.from("POLYGON"))
    expect(data.outpost.opp_addr).toBe(EVM_OPP)
    expect(data.outpost.opp_inbound_addr).toBe(EVM_INBOUND)
    expect(data.outpost.operator_registry_addr).toBe(EVM_OPREG)
    expect(data.outpost.source_deposit_addr).toBe(EVM_DEPOSIT)
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
