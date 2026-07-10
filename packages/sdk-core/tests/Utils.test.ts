import {
  arrayEquals,
  arrayToHex,
  hexToArray,
  concatBytes,
  isInstanceOf,
  ensure0x,
  dateToBlockTimestamp,
  checkDateParse,
  directSignHash,
  getCompressedPublicKey
} from "@wireio/sdk-core/Utils"
import { TimePoint } from "@wireio/sdk-core/chain/Time"
import { BLOCK_TIMESTAMP_EPOCH_MS, BLOCK_TIMESTAMP_INTERVAL_MS } from "@wireio/sdk-core/chain/constants"
import { KeyType } from "@wireio/sdk-core/chain/KeyType"

const COMPATIBILITY_PRIVATE_KEY =
  "0000000000000000000000000000000000000000000000000000000000000001"
const COMPATIBILITY_DIGEST =
  "5f78c33274e43fa9de5659265c1d917e25c03722dcb0b8d27db8d5feaa813953"
const COMPATIBILITY_COMPRESSED_PUBLIC_KEY =
  "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
const COMPATIBILITY_ETHEREUM_ADDRESS =
  "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf"
const COMPATIBILITY_ETHEREUM_SIGNATURE =
  "0x4070df19dc43aa4eff59a9e7669e03260682bc99b92eb570306ab5fe1f1946dd36128a31acf71f0df1441a3961f0b456189baf55b59baa6654d178a0954383ee1b"

describe("Utils", () => {
  describe("arrayEquals", () => {
    it("returns true for identical arrays", () => {
      expect(arrayEquals([1, 2, 3], [1, 2, 3])).toBe(true)
    })

    it("returns false for arrays with different values", () => {
      expect(arrayEquals([1, 2], [1, 3])).toBe(false)
    })

    it("returns false for arrays with different lengths", () => {
      expect(arrayEquals([1, 2], [1, 2, 3])).toBe(false)
    })

    it("returns true for empty arrays", () => {
      expect(arrayEquals([], [])).toBe(true)
    })
  })

  describe("arrayToHex", () => {
    it("converts Uint8Array to hex string", () => {
      expect(arrayToHex(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toBe(
        "deadbeef"
      )
    })

    it("handles single byte", () => {
      expect(arrayToHex(new Uint8Array([0x00]))).toBe("00")
    })

    it("handles empty array", () => {
      expect(arrayToHex(new Uint8Array([]))).toBe("")
    })
  })

  describe("hexToArray", () => {
    it("converts hex string to Uint8Array", () => {
      expect(hexToArray("deadbeef")).toEqual(
        new Uint8Array([0xde, 0xad, 0xbe, 0xef])
      )
    })

    it("handles uppercase hex", () => {
      expect(hexToArray("DEADBEEF")).toEqual(
        new Uint8Array([0xde, 0xad, 0xbe, 0xef])
      )
    })

    it("throws on odd number of hex digits", () => {
      expect(() => hexToArray("abc")).toThrow("Odd number of hex digits")
    })
  })

  describe("hex roundtrip", () => {
    it("hexToArray(arrayToHex(x)) equals x", () => {
      const original = new Uint8Array([0x01, 0x23, 0x45, 0x67, 0x89, 0xab])
      const result = hexToArray(arrayToHex(original))
      expect(result).toEqual(original)
    })
  })

  describe("concatBytes", () => {
    it("concatenates two arrays", () => {
      const result = concatBytes(
        new Uint8Array([1, 2]),
        new Uint8Array([3, 4])
      )
      expect(result).toEqual(new Uint8Array([1, 2, 3, 4]))
    })

    it("returns empty array with no args", () => {
      const result = concatBytes()
      expect(result).toEqual(new Uint8Array([]))
      expect(result.length).toBe(0)
    })

    it("concatenates multiple arrays", () => {
      const result = concatBytes(
        new Uint8Array([1]),
        new Uint8Array([2]),
        new Uint8Array([3])
      )
      expect(result).toEqual(new Uint8Array([1, 2, 3]))
    })
  })

  describe("isInstanceOf", () => {
    it("returns true for actual instances", () => {
      expect(isInstanceOf(new Date(), Date)).toBe(true)
    })

    it("returns false for non-instances", () => {
      expect(isInstanceOf("hello", Date)).toBe(false)
    })

    it("returns false for null", () => {
      expect(isInstanceOf(null, Date)).toBe(false)
    })

    it("returns false for undefined", () => {
      expect(isInstanceOf(undefined, Date)).toBe(false)
    })
  })

  describe("ensure0x", () => {
    it("adds 0x prefix when not present", () => {
      expect(ensure0x("abc")).toBe("0xabc")
    })

    it("does not double-prefix when 0x already present", () => {
      expect(ensure0x("0xabc")).toBe("0xabc")
    })

    it("handles empty string", () => {
      expect(ensure0x("")).toBe("0x")
    })
  })

  describe("Noble curve utilities", () => {
    it("compresses private and public keys compatibly", () => {
      const fromPrivate = getCompressedPublicKey(
        COMPATIBILITY_PRIVATE_KEY,
        KeyType.K1,
        true
      )
      const fromPublic = getCompressedPublicKey(fromPrivate, KeyType.K1)

      expect(fromPrivate).toBe(COMPATIBILITY_COMPRESSED_PUBLIC_KEY)
      expect(fromPublic).toBe(COMPATIBILITY_COMPRESSED_PUBLIC_KEY)
    })

    it("preserves direct Ethereum signing output", () => {
      expect(
        directSignHash(COMPATIBILITY_PRIVATE_KEY, COMPATIBILITY_DIGEST)
      ).toEqual({
        address: COMPATIBILITY_ETHEREUM_ADDRESS,
        signature: COMPATIBILITY_ETHEREUM_SIGNATURE
      })
    })
  })

  describe("dateToBlockTimestamp", () => {
    it("returns 0 for the epoch date (Jan 1, 2025)", () => {
      const tp = TimePoint.fromMilliseconds(BLOCK_TIMESTAMP_EPOCH_MS)
      expect(dateToBlockTimestamp(tp)).toBe(0)
    })

    it("returns correct slot for epoch + one interval", () => {
      const tp = TimePoint.fromMilliseconds(BLOCK_TIMESTAMP_EPOCH_MS + BLOCK_TIMESTAMP_INTERVAL_MS)
      expect(dateToBlockTimestamp(tp)).toBe(1)
    })

    it("returns correct slot for epoch + 10 seconds", () => {
      const tp = TimePoint.fromMilliseconds(BLOCK_TIMESTAMP_EPOCH_MS + 10000)
      expect(dateToBlockTimestamp(tp)).toBe(20) // 10000 / 500 = 20
    })

    it("matches BlockTimestamp.fromMilliseconds slot value", () => {
      const ms = BLOCK_TIMESTAMP_EPOCH_MS + 5000
      const tp = TimePoint.fromMilliseconds(ms)
      const slot = dateToBlockTimestamp(tp)
      expect(slot).toBe(Math.round((ms - BLOCK_TIMESTAMP_EPOCH_MS) / BLOCK_TIMESTAMP_INTERVAL_MS))
    })
  })

  describe("checkDateParse", () => {
    it("parses a valid ISO date string", () => {
      const result = checkDateParse("2025-01-01T00:00:00Z")
      expect(result).toBe(BLOCK_TIMESTAMP_EPOCH_MS)
    })

    it("throws on invalid date string", () => {
      expect(() => checkDateParse("not-a-date")).toThrow("Invalid time format")
    })
  })
})
