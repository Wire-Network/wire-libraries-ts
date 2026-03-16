import {
  isValidAccountName,
  isValidUrl,
  isValidKeyName,
  isValidEndpointName,
} from "../src/Validation"

describe("Validation", () => {
  describe("isValidAccountName", () => {
    it("accepts lowercase alpha name", () => {
      expect(isValidAccountName("alice")).toBe(true)
    })

    it("accepts name with digits 1-5", () => {
      expect(isValidAccountName("bob12345")).toBe(true)
    })

    it("accepts name with dots", () => {
      expect(isValidAccountName("a.b.c")).toBe(true)
    })

    it("accepts single character name", () => {
      expect(isValidAccountName("a")).toBe(true)
    })

    it("accepts 12 character name", () => {
      expect(isValidAccountName("abcde12345..")).toBe(true)
    })

    it("rejects empty string", () => {
      expect(isValidAccountName("")).toBe(false)
    })

    it("rejects uppercase letters", () => {
      expect(isValidAccountName("Alice")).toBe(false)
    })

    it("rejects special characters", () => {
      expect(isValidAccountName("bob@")).toBe(false)
    })

    it("rejects names longer than 12 characters", () => {
      expect(isValidAccountName("1234567890abc")).toBe(false)
    })

    it("rejects hyphens", () => {
      expect(isValidAccountName("hello-world")).toBe(false)
    })

    it("rejects underscores", () => {
      expect(isValidAccountName("hello_world")).toBe(false)
    })

    it("rejects digits 6-9", () => {
      expect(isValidAccountName("6789")).toBe(false)
    })

    it("rejects digit 0", () => {
      expect(isValidAccountName("abc0")).toBe(false)
    })
  })

  describe("isValidUrl", () => {
    it("accepts http://localhost:8888", () => {
      expect(isValidUrl("http://localhost:8888")).toBe(true)
    })

    it("accepts https://api.wire.network", () => {
      expect(isValidUrl("https://api.wire.network")).toBe(true)
    })

    it("accepts http with IP and port", () => {
      expect(isValidUrl("http://192.168.1.1:8080")).toBe(true)
    })

    it("rejects empty string", () => {
      expect(isValidUrl("")).toBe(false)
    })

    it("rejects ftp protocol", () => {
      expect(isValidUrl("ftp://foo.com")).toBe(false)
    })

    it("rejects non-URL string", () => {
      expect(isValidUrl("not-a-url")).toBe(false)
    })

    it("rejects URL without protocol", () => {
      expect(isValidUrl("localhost")).toBe(false)
    })

    it("rejects file protocol", () => {
      expect(isValidUrl("file:///etc/passwd")).toBe(false)
    })
  })

  describe("isValidKeyName", () => {
    it("accepts valid name with no existing names", () => {
      expect(isValidKeyName("my-key", [])).toBe(true)
    })

    it("accepts name not in existing names", () => {
      expect(isValidKeyName("new-key", ["key-1", "key-2"])).toBe(true)
    })

    it("rejects empty string", () => {
      expect(isValidKeyName("", [])).toBe(false)
    })

    it("rejects whitespace-only string", () => {
      expect(isValidKeyName("   ", [])).toBe(false)
    })

    it("rejects duplicate name in existing names", () => {
      expect(isValidKeyName("my-key", ["my-key", "other"])).toBe(false)
    })

    it("rejects duplicate after trimming", () => {
      expect(isValidKeyName("  my-key  ", ["my-key"])).toBe(false)
    })
  })

  describe("isValidEndpointName", () => {
    it("accepts valid name with no existing names", () => {
      expect(isValidEndpointName("mainnet", [])).toBe(true)
    })

    it("accepts name not in existing names", () => {
      expect(isValidEndpointName("testnet", ["mainnet"])).toBe(true)
    })

    it("rejects empty string", () => {
      expect(isValidEndpointName("", [])).toBe(false)
    })

    it("rejects whitespace-only string", () => {
      expect(isValidEndpointName("   ", [])).toBe(false)
    })

    it("rejects duplicate name in existing names", () => {
      expect(isValidEndpointName("mainnet", ["mainnet", "testnet"])).toBe(false)
    })

    it("rejects duplicate after trimming", () => {
      expect(isValidEndpointName("  mainnet  ", ["mainnet"])).toBe(false)
    })
  })
})
