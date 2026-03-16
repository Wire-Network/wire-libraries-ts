import { WireWalletClient, WalletNotFoundError } from "@wireio/wallet-ext-sdk"

const mockProvider = {
  isWireWallet: true as const,
  request: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
}

describe("WireWalletClient", () => {
  let client: WireWalletClient

  beforeEach(() => {
    client = new WireWalletClient()
    mockProvider.request.mockReset()
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

    test("getActiveAccount() throws WalletNotFoundError", async () => {
      await expect(client.getActiveAccount()).rejects.toThrow(WalletNotFoundError)
    })

    test("getPublicKeys() throws WalletNotFoundError", async () => {
      await expect(client.getPublicKeys()).rejects.toThrow(WalletNotFoundError)
    })

    test("getEndpoints() throws WalletNotFoundError", async () => {
      await expect(client.getEndpoints()).rejects.toThrow(WalletNotFoundError)
    })

    test("signTransaction() throws WalletNotFoundError", async () => {
      await expect(
        client.signTransaction({ serializedTransaction: "abcd" })
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
    test("calls provider.request with correct method", async () => {
      window.__WIRE_WALLET__ = mockProvider
      mockProvider.request.mockResolvedValue([])
      await client.getAccounts()
      expect(mockProvider.request).toHaveBeenCalledWith({ method: "wire_getAccounts" })
    })
  })

  describe("getActiveAccount()", () => {
    test("calls provider.request with correct method", async () => {
      window.__WIRE_WALLET__ = mockProvider
      mockProvider.request.mockResolvedValue(null)
      await client.getActiveAccount()
      expect(mockProvider.request).toHaveBeenCalledWith({ method: "wire_getActiveAccount" })
    })
  })

  describe("getPublicKeys()", () => {
    test("calls provider.request with correct method", async () => {
      window.__WIRE_WALLET__ = mockProvider
      mockProvider.request.mockResolvedValue([])
      await client.getPublicKeys()
      expect(mockProvider.request).toHaveBeenCalledWith({ method: "wire_getPublicKeys" })
    })
  })

  describe("getEndpoints()", () => {
    test("calls provider.request with correct method", async () => {
      window.__WIRE_WALLET__ = mockProvider
      mockProvider.request.mockResolvedValue([])
      await client.getEndpoints()
      expect(mockProvider.request).toHaveBeenCalledWith({ method: "wire_getEndpoints" })
    })
  })

  describe("signTransaction()", () => {
    test("calls provider.request with correct method and params", async () => {
      window.__WIRE_WALLET__ = mockProvider
      const request = {
        serializedTransaction: "deadbeef",
        chainId: "chain-123",
        requiredKeys: ["PUB_K1_abc"],
      }
      mockProvider.request.mockResolvedValue({
        signatures: ["SIG_K1_xyz"],
        serializedTransaction: "deadbeef",
      })
      await client.signTransaction(request)
      expect(mockProvider.request).toHaveBeenCalledWith({
        method: "wire_signTransaction",
        params: [request],
      })
    })
  })

  describe("isUnlocked()", () => {
    test("calls provider.request with correct method", async () => {
      window.__WIRE_WALLET__ = mockProvider
      mockProvider.request.mockResolvedValue(true)
      const result = await client.isUnlocked()
      expect(mockProvider.request).toHaveBeenCalledWith({ method: "wire_isUnlocked" })
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
