import { PrivateKey } from "@wireio/sdk-core/chain/PrivateKey"
import { KeyType } from "@wireio/sdk-core/chain/KeyType"

describe("PrivateKey", () => {
  describe("generate", () => {
    test("generates K1 key with 32-byte data", () => {
      const pvt = PrivateKey.generate(KeyType.K1)
      expect(pvt.type).toBe(KeyType.K1)
      expect(pvt.data.array.length).toBe(32)
    })

    test("generates R1 key with 32-byte data", () => {
      const pvt = PrivateKey.generate(KeyType.R1)
      expect(pvt.type).toBe(KeyType.R1)
      expect(pvt.data.array.length).toBe(32)
    })

    test("generates EM key with 32-byte data", () => {
      const pvt = PrivateKey.generate(KeyType.EM)
      expect(pvt.type).toBe(KeyType.EM)
      expect(pvt.data.array.length).toBe(32)
    })

    test("generates ED key with 64-byte data", () => {
      const pvt = PrivateKey.generate(KeyType.ED)
      expect(pvt.type).toBe(KeyType.ED)
      expect(pvt.data.array.length).toBe(64)
    })

    test("generates unique keys on each call", () => {
      const a = PrivateKey.generate(KeyType.K1)
      const b = PrivateKey.generate(KeyType.K1)
      expect(a.data.array).not.toEqual(b.data.array)
    })
  })

  describe("from", () => {
    test("roundtrips K1 key through toString/from", () => {
      const pvt = PrivateKey.generate(KeyType.K1)
      const parsed = PrivateKey.from(pvt.toString())
      expect(parsed.type).toBe(KeyType.K1)
      expect(parsed.data.array).toEqual(pvt.data.array)
    })

    test("roundtrips R1 key through toString/from", () => {
      const pvt = PrivateKey.generate(KeyType.R1)
      const parsed = PrivateKey.from(pvt.toString())
      expect(parsed.type).toBe(KeyType.R1)
      expect(parsed.data.array).toEqual(pvt.data.array)
    })

    test("parses EM key with hex encoding", () => {
      const pvt = PrivateKey.generate(KeyType.EM)
      const hex = Array.from(pvt.data.array)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
      const parsed = PrivateKey.from(`PVT_EM_${hex}`)
      expect(parsed.type).toBe(KeyType.EM)
      expect(parsed.data.array).toEqual(pvt.data.array)
    })

    test("parses EM key with 0x-prefixed hex encoding", () => {
      const pvt = PrivateKey.generate(KeyType.EM)
      const hex = Array.from(pvt.data.array)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
      const parsed = PrivateKey.from(`PVT_EM_0x${hex}`)
      expect(parsed.type).toBe(KeyType.EM)
      expect(parsed.data.array).toEqual(pvt.data.array)
    })

    test("EM hex with and without 0x prefix produce same key", () => {
      const pvt = PrivateKey.generate(KeyType.EM)
      const hex = Array.from(pvt.data.array)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
      const a = PrivateKey.from(`PVT_EM_${hex}`)
      const b = PrivateKey.from(`PVT_EM_0x${hex}`)
      expect(a.data.array).toEqual(b.data.array)
    })

    test("throws on invalid PVT format", () => {
      expect(() => PrivateKey.from("PVT_K1")).toThrow("Invalid PVT format")
    })

    test("throws on invalid WIF", () => {
      expect(() => PrivateKey.from("notavalidkey")).toThrow()
    })
  })

  describe("toPublic", () => {
    test("derives public key from K1 private key", () => {
      const pvt = PrivateKey.generate(KeyType.K1)
      const pub = pvt.toPublic()
      expect(pub.type).toBe(KeyType.K1)
      expect(pub.toString()).toMatch(/^PUB_K1_/)
    })

    test("derives public key from R1 private key", () => {
      const pvt = PrivateKey.generate(KeyType.R1)
      const pub = pvt.toPublic()
      expect(pub.type).toBe(KeyType.R1)
      expect(pub.toString()).toMatch(/^PUB_R1_/)
    })

    test("derives public key from EM private key", () => {
      const pvt = PrivateKey.generate(KeyType.EM)
      const pub = pvt.toPublic()
      expect(pub.type).toBe(KeyType.EM)
      expect(pub.toString()).toMatch(/^PUB_EM_/)
    })

    test("derives public key from ED private key", () => {
      const pvt = PrivateKey.generate(KeyType.ED)
      const pub = pvt.toPublic()
      expect(pub.type).toBe(KeyType.ED)
      expect(pub.toString()).toMatch(/^PUB_ED_/)
    })

    test("same private key always derives same public key", () => {
      const pvt = PrivateKey.generate(KeyType.K1)
      const pub1 = pvt.toPublic()
      const pub2 = pvt.toPublic()
      expect(pub1.toString()).toBe(pub2.toString())
    })
  })

  describe("signMessage", () => {
    test("K1 key signs a message and produces a signature", () => {
      const pvt = PrivateKey.generate(KeyType.K1)
      const sig = pvt.signMessage(new Uint8Array([1, 2, 3]))
      expect(sig.type).toBe(KeyType.K1)
      expect(sig.toString()).toMatch(/^SIG_K1_/)
    })

    test("EM key signs a message and produces a signature", () => {
      const pvt = PrivateKey.generate(KeyType.EM)
      const sig = pvt.signMessage(new Uint8Array([1, 2, 3]))
      expect(sig.type).toBe(KeyType.EM)
      expect(sig.toString()).toMatch(/^SIG_EM_/)
    })

    test("ED key signs a message and produces a signature", () => {
      const pvt = PrivateKey.generate(KeyType.ED)
      const sig = pvt.signMessage(new Uint8Array([1, 2, 3]))
      expect(sig.type).toBe(KeyType.ED)
      expect(sig.toString()).toMatch(/^SIG_ED_/)
    })
  })

  describe("from — PVT_ parsing", () => {
    /**
     * Regression: `decodeKey` used to `split("_")` and demand exactly 3 parts.
     * A BLS payload is base64url, whose alphabet INCLUDES "_", so roughly half
     * of all valid `PVT_BLS_…` keys carry one and were rejected as
     * "Invalid PVT format". Measured 150/300 before the fix.
     */
    test("round-trips a BLS key whose base64url payload contains an underscore", () => {
      const underscored = Array.from({ length: 40 }, () =>
        PrivateKey.generate(KeyType.BLS).toString()
      ).filter(encoded => encoded.slice("PVT_BLS_".length).includes("_"))

      // 40 draws at ~50% each — an empty set would itself be the anomaly.
      expect(underscored.length).toBeGreaterThan(0)

      underscored.forEach(encoded => {
        const parsed = PrivateKey.from(encoded)
        expect(parsed.type).toBe(KeyType.BLS)
        expect(parsed.toString()).toBe(encoded)
      })
    })

    test("round-trips every curve exactly", () => {
      ;[KeyType.K1, KeyType.R1, KeyType.EM, KeyType.ED, KeyType.BLS].forEach(
        keyType => {
          const encoded = PrivateKey.generate(keyType).toString()
          expect(PrivateKey.from(encoded).toString()).toBe(encoded)
        }
      )
    })

    test("still rejects a PVT_ string with no second underscore", () => {
      expect(() => PrivateKey.from("PVT_NOSEPARATOR")).toThrow(
        /Invalid PVT format/
      )
    })
  })
})
