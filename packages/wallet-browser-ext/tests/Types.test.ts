import {
  ChainKind,
  KeyType,
  type KeyPair,
  type ChainEndpoint,
  type WireAccount,
  type ExtensionState,
  type BackgroundMessage,
  type BackgroundResponse,
} from "../src/Types"

describe("Types", () => {
  describe("ChainKind enum", () => {
    it("has WIRE value", () => {
      expect(ChainKind.WIRE).toBe("WIRE")
    })

    it("has ETHEREUM value", () => {
      expect(ChainKind.ETHEREUM).toBe("ETHEREUM")
    })

    it("has SOLANA value", () => {
      expect(ChainKind.SOLANA).toBe("SOLANA")
    })

    it("has SUI value", () => {
      expect(ChainKind.SUI).toBe("SUI")
    })

    it("has exactly 4 members", () => {
      const values = Object.values(ChainKind)
      expect(values).toHaveLength(4)
    })
  })

  describe("KeyType re-export", () => {
    it("is defined", () => {
      expect(KeyType).toBeDefined()
    })

    it("has K1 value", () => {
      expect(KeyType.K1).toBeDefined()
    })
  })

  describe("KeyPair shape", () => {
    it("accepts a valid KeyPair object", () => {
      const kp: KeyPair = {
        id: "key-1",
        name: "test-key",
        type: KeyType.K1,
        privateKey: "PVT_K1_abc",
        publicKey: "PUB_K1_abc",
      }
      expect(kp.id).toBe("key-1")
      expect(kp.name).toBe("test-key")
      expect(kp.type).toBe(KeyType.K1)
      expect(kp.privateKey).toBe("PVT_K1_abc")
      expect(kp.publicKey).toBe("PUB_K1_abc")
    })

    it("accepts optional address field", () => {
      const kp: KeyPair = {
        id: "key-2",
        name: "eth-key",
        type: KeyType.K1,
        privateKey: "PVT_K1_abc",
        publicKey: "PUB_K1_abc",
        address: "0x1234",
      }
      expect(kp.address).toBe("0x1234")
    })
  })

  describe("ChainEndpoint shape", () => {
    it("accepts a valid ChainEndpoint object", () => {
      const ep: ChainEndpoint = {
        id: "ep-1",
        name: "local",
        kind: ChainKind.WIRE,
        url: "http://localhost:8888",
      }
      expect(ep.id).toBe("ep-1")
      expect(ep.name).toBe("local")
      expect(ep.kind).toBe(ChainKind.WIRE)
      expect(ep.url).toBe("http://localhost:8888")
    })
  })

  describe("WireAccount shape", () => {
    it("accepts a valid WireAccount object", () => {
      const acct: WireAccount = {
        id: "acct-1",
        name: "alice",
        endpoints: ["ep-1"],
        keys: ["key-1"],
      }
      expect(acct.id).toBe("acct-1")
      expect(acct.name).toBe("alice")
      expect(acct.endpoints).toEqual(["ep-1"])
      expect(acct.keys).toEqual(["key-1"])
    })
  })

  describe("ExtensionState shape", () => {
    it("accepts a valid ExtensionState without activeAccount", () => {
      const state: ExtensionState = {
        keys: [],
        endpoints: [],
        accounts: [],
      }
      expect(state.keys).toEqual([])
      expect(state.activeAccount).toBeUndefined()
    })

    it("accepts a valid ExtensionState with activeAccount", () => {
      const state: ExtensionState = {
        keys: [],
        endpoints: [],
        accounts: [],
        activeAccount: {
          accountId: "acct-1",
          keyId: "key-1",
          endpointId: "ep-1",
        },
      }
      expect(state.activeAccount).toEqual({
        accountId: "acct-1",
        keyId: "key-1",
        endpointId: "ep-1",
      })
    })
  })

  describe("BackgroundMessage type", () => {
    it("accepts GET_STATE message", () => {
      const msg: BackgroundMessage = { type: "GET_STATE" }
      expect(msg.type).toBe("GET_STATE")
    })

    it("accepts UNLOCK message with password", () => {
      const msg: BackgroundMessage = { type: "UNLOCK", password: "secret" }
      expect(msg.type).toBe("UNLOCK")
    })

    it("accepts LOCK message", () => {
      const msg: BackgroundMessage = { type: "LOCK" }
      expect(msg.type).toBe("LOCK")
    })
  })

  describe("BackgroundResponse type", () => {
    it("accepts success response", () => {
      const res: BackgroundResponse = { success: true, data: { foo: "bar" } }
      expect(res.success).toBe(true)
    })

    it("accepts error response", () => {
      const res: BackgroundResponse = { success: false, error: "something went wrong" }
      expect(res.success).toBe(false)
    })
  })
})
