import type { ExtensionState } from "../src/Types"
import { ChainKind, KeyType } from "../src/Types"

// Set up chrome mock before importing Storage module
const mockStorage: Record<string, any> = {}
const chromeMock = {
  storage: {
    local: {
      get: jest.fn((key: string) =>
        Promise.resolve(key in mockStorage ? { [key]: mockStorage[key] } : {})
      ),
      set: jest.fn((items: Record<string, any>) => {
        Object.assign(mockStorage, items)
        return Promise.resolve()
      }),
      remove: jest.fn((key: string) => {
        delete mockStorage[key]
        return Promise.resolve()
      }),
    },
  },
}
;(globalThis as any).chrome = chromeMock

import {
  saveEncryptedState,
  loadEncryptedState,
  hasVault,
  clearVault,
} from "../src/Storage"

const sampleState: ExtensionState = {
  keys: [
    {
      id: "key-1",
      name: "test-key",
      type: KeyType.K1,
      privateKey: "PVT_K1_test",
      publicKey: "PUB_K1_test",
    },
  ],
  endpoints: [
    {
      id: "ep-1",
      name: "local",
      kind: ChainKind.WIRE,
      url: "http://localhost:8888",
    },
  ],
  accounts: [
    {
      id: "acct-1",
      name: "alice",
      endpoints: ["ep-1"],
      keys: ["key-1"],
    },
  ],
}

describe("Storage", () => {
  beforeEach(() => {
    // Clear mock storage between tests
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k])
    jest.clearAllMocks()
  })

  it("hasVault returns false initially", async () => {
    expect(await hasVault()).toBe(false)
  })

  it("saveEncryptedState + hasVault returns true", async () => {
    await saveEncryptedState(sampleState, "password123")
    expect(await hasVault()).toBe(true)
  })

  it("saveEncryptedState + loadEncryptedState roundtrip preserves state", async () => {
    const password = "my-secret-password"
    await saveEncryptedState(sampleState, password)
    const loaded = await loadEncryptedState(password)
    expect(loaded).toEqual(sampleState)
  })

  it("loadEncryptedState with wrong password throws", async () => {
    await saveEncryptedState(sampleState, "correct-password")
    await expect(loadEncryptedState("wrong-password")).rejects.toThrow()
  })

  it("loadEncryptedState with no vault throws", async () => {
    await expect(loadEncryptedState("any-password")).rejects.toThrow(
      "No vault found"
    )
  })

  it("clearVault removes data", async () => {
    await saveEncryptedState(sampleState, "password")
    await clearVault()
    await expect(loadEncryptedState("password")).rejects.toThrow(
      "No vault found"
    )
  })

  it("clearVault + hasVault returns false", async () => {
    await saveEncryptedState(sampleState, "password")
    expect(await hasVault()).toBe(true)
    await clearVault()
    expect(await hasVault()).toBe(false)
  })

  it("chrome.storage.local.set is called when saving", async () => {
    await saveEncryptedState(sampleState, "password")
    expect(chromeMock.storage.local.set).toHaveBeenCalledTimes(1)
    const callArg = chromeMock.storage.local.set.mock.calls[0][0]
    expect(callArg).toHaveProperty("wire_wallet_vault")
    expect(typeof callArg.wire_wallet_vault).toBe("string")
  })

  it("preserves activeAccount in state roundtrip", async () => {
    const stateWithActive: ExtensionState = {
      ...sampleState,
      activeAccount: {
        accountId: "acct-1",
        keyId: "key-1",
        endpointId: "ep-1",
      },
    }
    const password = "password"
    await saveEncryptedState(stateWithActive, password)
    const loaded = await loadEncryptedState(password)
    expect(loaded).toEqual(stateWithActive)
    expect(loaded.activeAccount).toEqual({
      accountId: "acct-1",
      keyId: "key-1",
      endpointId: "ep-1",
    })
  })
})
