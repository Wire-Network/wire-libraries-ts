import { WireWalletClient, WalletNotFoundError } from "@wireio/wallet-ext-sdk"

const mockProvider = {
  isWireWallet: true as const,
  version: "1.0.0",
  isUnlocked: jest.fn(),
  getAccounts: jest.fn(),
  signTransaction: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
}

describe("WireWalletClient", () => {
  let client: WireWalletClient

  beforeEach(() => {
    client = new WireWalletClient()
    mockProvider.isUnlocked.mockReset()
    mockProvider.getAccounts.mockReset()
    mockProvider.signTransaction.mockReset()
    mockProvider.on.mockReset()
    mockProvider.removeListener.mockReset()
    delete window.__WIRE_WALLET__
  })

  afterEach(() => {
    delete window.__WIRE_WALLET__
  })

  describe("isInstalled()", () => {
    test("returns false when window.__WIRE_WALLET__ is undefined", () => {
      expect(client.isInstalled()).toBe(false)
    })

    test("returns true when window.__WIRE_WALLET__ is defined", () => {
      window.__WIRE_WALLET__ = mockProvider
      expect(client.isInstalled()).toBe(true)
    })
  })

  describe("methods throw WalletNotFoundError when provider not available", () => {
    test("getAccounts() throws WalletNotFoundError", async () => {
      await expect(client.getAccounts()).rejects.toThrow(WalletNotFoundError)
    })

    test("signTransaction() throws WalletNotFoundError", async () => {
      await expect(
        client.signTransaction({ digest: "abcd", accountId: "test" })
      ).rejects.toThrow(WalletNotFoundError)
    })

    test("isUnlocked() throws WalletNotFoundError", async () => {
      await expect(client.isUnlocked()).rejects.toThrow(WalletNotFoundError)
    })

    test("on() throws WalletNotFoundError", () => {
      expect(() => client.on("lock", jest.fn())).toThrow(WalletNotFoundError)
    })

    test("removeListener() throws WalletNotFoundError", () => {
      expect(() => client.removeListener("lock", jest.fn())).toThrow(WalletNotFoundError)
    })
  })

  describe("getAccounts()", () => {
    test("calls provider.getAccounts", async () => {
      window.__WIRE_WALLET__ = mockProvider
      mockProvider.getAccounts.mockResolvedValue([])
      const result = await client.getAccounts()
      expect(mockProvider.getAccounts).toHaveBeenCalled()
      expect(result).toEqual([])
    })
  })

  describe("signTransaction()", () => {
    test("calls provider.signTransaction with digest and accountId", async () => {
      window.__WIRE_WALLET__ = mockProvider
      const request = {
        digest: "deadbeef",
        accountId: "account-123",
      }
      mockProvider.signTransaction.mockResolvedValue("SIG_K1_xyz")
      const result = await client.signTransaction(request)
      expect(mockProvider.signTransaction).toHaveBeenCalledWith("deadbeef", "account-123")
      expect(result).toEqual({ signatures: ["SIG_K1_xyz"] })
    })
  })

  describe("isUnlocked()", () => {
    test("calls provider.isUnlocked", async () => {
      window.__WIRE_WALLET__ = mockProvider
      mockProvider.isUnlocked.mockResolvedValue(true)
      const result = await client.isUnlocked()
      expect(mockProvider.isUnlocked).toHaveBeenCalled()
      expect(result).toBe(true)
    })
  })

  describe("on()", () => {
    test("calls provider.on with event and handler", () => {
      window.__WIRE_WALLET__ = mockProvider
      const handler = jest.fn()
      client.on("accountChanged", handler)
      expect(mockProvider.on).toHaveBeenCalledWith("accountChanged", handler)
    })
  })

  describe("removeListener()", () => {
    test("calls provider.removeListener with event and handler", () => {
      window.__WIRE_WALLET__ = mockProvider
      const handler = jest.fn()
      client.removeListener("disconnect", handler)
      expect(mockProvider.removeListener).toHaveBeenCalledWith("disconnect", handler)
    })
  })

  describe("waitForProvider()", () => {
    test("resolves immediately when provider is already available", async () => {
      window.__WIRE_WALLET__ = mockProvider
      const provider = await client.waitForProvider()
      expect(provider.isWireWallet).toBe(true)
    })

    test("resolves when provider becomes available", async () => {
      const promise = client.waitForProvider(2000)
      // Simulate the provider appearing after a short delay
      setTimeout(() => {
        window.__WIRE_WALLET__ = mockProvider
      }, 150)
      const provider = await promise
      expect(provider.isWireWallet).toBe(true)
    })

    test("rejects with WalletNotFoundError on timeout", async () => {
      await expect(client.waitForProvider(200)).rejects.toThrow(WalletNotFoundError)
    })
  })
})