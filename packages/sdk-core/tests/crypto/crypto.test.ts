import { createHash } from "crypto"
import { PrivateKey } from "@wireio/sdk-core/chain/PrivateKey"
import { PublicKey } from "@wireio/sdk-core/chain/PublicKey"
import { Signature } from "@wireio/sdk-core/chain/Signature"
import { KeyType } from "@wireio/sdk-core/chain/KeyType"
import { Bytes } from "@wireio/sdk-core/chain/Bytes"
import { Checksum256 } from "@wireio/sdk-core/chain/Checksum"
import { generate } from "@wireio/sdk-core/crypto/Generate"
import { getPublic } from "@wireio/sdk-core/crypto/GetPublic"
import { sign } from "@wireio/sdk-core/crypto/Sign"
import { verify } from "@wireio/sdk-core/crypto/Verify"
import { recover } from "@wireio/sdk-core/crypto/Recover"
import { sharedSecret } from "@wireio/sdk-core/crypto/SharedSecret"
import { getCurve } from "@wireio/sdk-core/crypto/Curves"

function sha256(data: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(data).digest())
}

/** Convert SignatureParts to wire-format Uint8Array for low-level verify/recover. */
function sigPartsToBytes(parts: {
  r: Uint8Array
  s: Uint8Array
  recid: number
  type: KeyType
}): Uint8Array {
  if (parts.type === KeyType.ED) {
    const buf = new Uint8Array(64)
    buf.set(parts.r, 0)
    buf.set(parts.s, 32)
    return buf
  }
  const buf = new Uint8Array(65)
  buf[0] = parts.recid + 31
  buf.set(parts.r, 1)
  buf.set(parts.s, 33)
  return buf
}

describe("PrivateKey deterministic derivation", () => {
  const privKeyDigest = sha256("nathan")
  const privKey = PrivateKey.regenerate(KeyType.K1, privKeyDigest)
  const privKeyStr = privKey.toString()
  const privKeyWifStr = privKey.toWif()
  const pubKey = privKey.toPublic()
  const pubKeyStr = pubKey.toString()
  const pubKeyWifStr = pubKey.toLegacyString()

  test("regenerate from sha256('nathan') produces known public key", () => {
    expect(pubKeyWifStr).toBe(
      "SYS6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5GDW5CV"
    )
  })

  test("private key string is PVT_K1_ format", () => {
    expect(privKeyStr).toMatch(/^PVT_K1_/)
  })

  test("private key WIF starts with 5", () => {
    expect(privKeyWifStr).toMatch(/^5/)
  })

  test("public key string is PUB_K1_ format", () => {
    expect(pubKeyStr).toMatch(/^PUB_K1_/)
  })

  test("private key roundtrips through WIF", () => {
    const restored = PrivateKey.fromString(privKeyWifStr)
    expect(restored.data.array).toEqual(privKey.data.array)
    expect(restored.type).toBe(KeyType.K1)
  })

  test("private key roundtrips through PVT string", () => {
    const restored = PrivateKey.from(privKeyStr)
    expect(restored.data.array).toEqual(privKey.data.array)
  })

  test("public key roundtrips through string", () => {
    const restored = PublicKey.from(pubKeyStr)
    expect(restored.data.array).toEqual(pubKey.data.array)
    expect(restored.type).toBe(KeyType.K1)
  })

  test("public key roundtrips through legacy string", () => {
    const restored = PublicKey.from(pubKeyWifStr)
    expect(restored.data.array).toEqual(pubKey.data.array)
  })
})

describe("PrivateKey sign and verify", () => {
  const message = new Uint8Array([0xde, 0xad, 0xbe, 0xef])

  test("K1 sign/verify roundtrip", () => {
    const pvt = PrivateKey.generate(KeyType.K1)
    const pub = pvt.toPublic()
    const sig = pvt.signMessage(message)
    expect(sig.verifyMessage(message, pub)).toBe(true)
  })

  test("K1 signature recovers correct public key", () => {
    const pvt = PrivateKey.generate(KeyType.K1)
    const pub = pvt.toPublic()
    const sig = pvt.signMessage(message)
    const recovered = sig.recoverMessage(message)
    expect(recovered.data.array).toEqual(pub.data.array)
  })

  test("R1 sign/verify roundtrip", () => {
    const pvt = PrivateKey.generate(KeyType.R1)
    const pub = pvt.toPublic()
    const sig = pvt.signMessage(message)
    expect(sig.verifyMessage(message, pub)).toBe(true)
  })

  test("EM key signs a message and produces a signature", () => {
    const pvt = PrivateKey.generate(KeyType.EM)
    const sig = pvt.signMessage(message)
    expect(sig.type).toBe(KeyType.EM)
    expect(sig.toString()).toMatch(/^SIG_EM_/)
  })

  test("ED sign/verify roundtrip", () => {
    const pvt = PrivateKey.generate(KeyType.ED)
    const pub = pvt.toPublic()
    const sig = pvt.signMessage(message)
    expect(sig.verifyMessage(message, pub)).toBe(true)
  })

  test("verification fails with wrong public key", () => {
    const pvt1 = PrivateKey.generate(KeyType.K1)
    const pvt2 = PrivateKey.generate(KeyType.K1)
    const sig = pvt1.signMessage(message)
    expect(sig.verifyMessage(message, pvt2.toPublic())).toBe(false)
  })

  test("verification fails with wrong message", () => {
    const pvt = PrivateKey.generate(KeyType.K1)
    const pub = pvt.toPublic()
    const sig = pvt.signMessage(message)
    const wrong = new Uint8Array([0xca, 0xfe, 0xba, 0xbe])
    expect(sig.verifyMessage(wrong, pub)).toBe(false)
  })
})

describe("PrivateKey shared secret", () => {
  test("K1 ECDH shared secret is symmetric", () => {
    const a = PrivateKey.generate(KeyType.K1)
    const b = PrivateKey.generate(KeyType.K1)
    const secretAB = a.sharedSecret(b.toPublic())
    const secretBA = b.sharedSecret(a.toPublic())
    expect(secretAB.array).toEqual(secretBA.array)
  })

  test("R1 ECDH shared secret is symmetric", () => {
    const a = PrivateKey.generate(KeyType.R1)
    const b = PrivateKey.generate(KeyType.R1)
    const secretAB = a.sharedSecret(b.toPublic())
    const secretBA = b.sharedSecret(a.toPublic())
    expect(secretAB.array).toEqual(secretBA.array)
  })
})

describe("crypto low-level functions", () => {
  describe("generate", () => {
    test("K1 produces 32 bytes", () => {
      expect(generate(KeyType.K1).length).toBe(32)
    })

    test("R1 produces 32 bytes", () => {
      expect(generate(KeyType.R1).length).toBe(32)
    })

    test("EM produces 32 bytes", () => {
      expect(generate(KeyType.EM).length).toBe(32)
    })

    test("ED produces 64 bytes", () => {
      expect(generate(KeyType.ED).length).toBe(64)
    })
  })

  describe("getPublic", () => {
    test("K1 compressed public key is 33 bytes", () => {
      const secret = generate(KeyType.K1)
      const pub = getPublic(secret, KeyType.K1)
      expect(pub.length).toBe(33)
      expect(pub[0] === 0x02 || pub[0] === 0x03).toBe(true)
    })

    test("ED public key is 32 bytes", () => {
      const secret = generate(KeyType.ED)
      const pub = getPublic(secret, KeyType.ED)
      expect(pub.length).toBe(32)
    })
  })

  describe("sign and verify (low-level)", () => {
    test("K1 sign then verify", () => {
      const secret = generate(KeyType.K1)
      const pub = getPublic(secret, KeyType.K1)
      const digest = sha256("test message")
      const parts = sign(secret, digest, KeyType.K1)
      const sigBytes = sigPartsToBytes(parts)
      expect(verify(sigBytes, digest, pub, KeyType.K1)).toBe(true)
    })

    test("R1 sign then verify", () => {
      const secret = generate(KeyType.R1)
      const pub = getPublic(secret, KeyType.R1)
      const digest = sha256("test message")
      const parts = sign(secret, digest, KeyType.R1)
      const sigBytes = sigPartsToBytes(parts)
      expect(verify(sigBytes, digest, pub, KeyType.R1)).toBe(true)
    })

    test("ED sign then verify", () => {
      const secret = generate(KeyType.ED)
      const pub = getPublic(secret, KeyType.ED)
      const msg = new Uint8Array([1, 2, 3, 4])
      const parts = sign(secret, msg, KeyType.ED)
      const sigBytes = sigPartsToBytes(parts)
      expect(verify(sigBytes, msg, pub, KeyType.ED)).toBe(true)
    })
  })

  describe("recover", () => {
    test("K1 recovers correct public key from signature", () => {
      const secret = generate(KeyType.K1)
      const pub = getPublic(secret, KeyType.K1)
      const digest = sha256("recover test")
      const parts = sign(secret, digest, KeyType.K1)
      const sigBytes = sigPartsToBytes(parts)
      const recovered = recover(sigBytes, digest, KeyType.K1)
      expect(recovered.data.array).toEqual(new Uint8Array(pub))
    })
  })

  describe("sharedSecret", () => {
    test("K1 ECDH produces consistent shared secret", () => {
      const a = generate(KeyType.K1)
      const b = generate(KeyType.K1)
      const pubA = getPublic(a, KeyType.K1)
      const pubB = getPublic(b, KeyType.K1)
      const sAB = sharedSecret(a, pubB, KeyType.K1)
      const sBA = sharedSecret(b, pubA, KeyType.K1)
      expect(sAB).toEqual(sBA)
    })

    test("ED throws for shared secret", () => {
      const a = generate(KeyType.ED)
      const b = generate(KeyType.ED)
      const pubB = getPublic(b, KeyType.ED)
      expect(() => sharedSecret(a, pubB, KeyType.ED)).toThrow()
    })
  })

  describe("getCurve", () => {
    test("returns secp256k1 for K1", () => {
      const curve = getCurve(KeyType.K1)
      expect(curve).toBeDefined()
    })

    test("returns p256 for R1", () => {
      const curve = getCurve(KeyType.R1)
      expect(curve).toBeDefined()
    })

    test("returns secp256k1 for EM", () => {
      const curve = getCurve(KeyType.EM)
      expect(curve).toBeDefined()
    })

    test("throws for ED", () => {
      expect(() => getCurve(KeyType.ED)).toThrow()
    })

    test("caches curve instances", () => {
      const a = getCurve(KeyType.K1)
      const b = getCurve(KeyType.K1)
      expect(a).toBe(b)
    })
  })
})
