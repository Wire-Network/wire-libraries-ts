import "jest"
import { createHash } from "crypto"
import { PrivateKey } from "@wireio/sdk-core/chain/PrivateKey"
import { PublicKey } from "@wireio/sdk-core/chain/PublicKey"
import { Signature } from "@wireio/sdk-core/chain/Signature"
import { KeyType } from "@wireio/sdk-core/chain/KeyType"
import { Bytes } from "@wireio/sdk-core/chain/Bytes"
import { Checksum256 } from "@wireio/sdk-core/chain/Checksum"
import { ABIDecoder } from "@wireio/sdk-core/serializer/Decoder"
import { ABIEncoder } from "@wireio/sdk-core/serializer/Encoder"
import { generate } from "@wireio/sdk-core/crypto/Generate"
import { getPublic } from "@wireio/sdk-core/crypto/GetPublic"
import { sign } from "@wireio/sdk-core/crypto/Sign"
import { verify } from "@wireio/sdk-core/crypto/Verify"
import { recover } from "@wireio/sdk-core/crypto/Recover"
import { sharedSecret } from "@wireio/sdk-core/crypto/SharedSecret"
import { getCurve, getNobleCurve } from "@wireio/sdk-core/crypto/Curves"
import { arrayToHex, hexToArray } from "@wireio/sdk-core/Utils"

function sha256(data: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(data).digest())
}

const EXTERNAL_EM_PRIVATE_KEY_HEX =
  "4646464646464646464646464646464646464646464646464646464646464646"
const EXTERNAL_EM_PUBLIC_KEY_HEX =
  "024bc2a31265153f07e70e0bab08724e6b85e217f8cd628ceb62974247bb493382"
// Known-answer values generated with ethers EIP-191 personal signing.
const EXTERNAL_EM_MESSAGE = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
const EXTERNAL_EM_MESSAGE_SIGNATURE =
  "SIG_EM_e634c2b988f47ed8fe2bfda5c5a47dbc69016c87623a0833e92a9c1e81fdb03d671324c546436acaa3d12be447248b3892477b274a85cc2c20a0a49cd2d04cad1b"
const EXTERNAL_EM_DIGEST_HEX =
  "5f78c33274e43fa9de5659265c1d917e25c03722dcb0b8d27db8d5feaa813953"
const EXTERNAL_EM_DIGEST_SIGNATURE =
  "SIG_EM_04aa0eac2aceafd510b9f3c04c4afbecc499d127062d68e4c93d7ebfe44293e70c8b9c9b61b8a2c2b674313542916d191d9c444918820bfce0af0594c87165fb1c"
const COMPATIBILITY_DIGEST = Checksum256.from(EXTERNAL_EM_DIGEST_HEX)
const COMPATIBILITY_K1_SECRET = hexToArray(
  "0000000000000000000000000000000000000000000000000000000000000001"
)
const COMPATIBILITY_K1_PEER_SECRET = hexToArray(
  "0000000000000000000000000000000000000000000000000000000000000002"
)
const COMPATIBILITY_K1_SIGNATURE =
  "SIG_K1_KVEsnUXKnwNxrw3z9ZSPrzaprNPrJfBYtWoNVf34kzoijiB2ffLeTqGx4RGyUwWKBZCDjAY17kh1bx8cAtZeUWNXsswb96"
const COMPATIBILITY_K1_SHARED_SECRET =
  "11a1adf935ed585ec673a7669031008168890c01adb0a7e4bdc5415f76186e027162dc961d2dc676a31caa14e07120ff4f7b44da25e64a934fc8cd815adc9ae5"
const COMPATIBILITY_R1_SECRET = hexToArray(
  "0000000000000000000000000000000000000000000000000000000000000003"
)
const COMPATIBILITY_R1_SIGNATURE =
  "SIG_R1_Jwke3hu8GZprqPz2Dv97ENZ2aY3pEVpuNcxeJkfuvv3XUbp8nWFaZmgbF97Yx32brNEULsuco1RHtP97PqdPoC7WHqnueC"
const COMPATIBILITY_MNEMONIC =
  "test test test test test test test test test test test junk"
const COMPATIBILITY_MNEMONIC_ADDRESS =
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
const COMPATIBILITY_MNEMONIC_PRIVATE_KEY =
  "PVT_K1_2JmTFo8knhffGK32o8vv4oRd8sA7MYo2xx1j4yhAPxN3JsLzv1"
const COMPATIBILITY_MNEMONIC_PUBLIC_KEY =
  "PUB_K1_7pyBBnwHmDD6tKMunrobP5mgbqWgei4GAx42c9Bof3kjSUdPTx"

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

  test("mnemonic derivation preserves the default Ethereum path", () => {
    const derived = PrivateKey.fromMnemonic(COMPATIBILITY_MNEMONIC)

    expect(derived.address).toBe(COMPATIBILITY_MNEMONIC_ADDRESS)
    expect(derived.private_key.toString()).toBe(
      COMPATIBILITY_MNEMONIC_PRIVATE_KEY
    )
    expect(derived.private_key.toPublic().toString()).toBe(
      COMPATIBILITY_MNEMONIC_PUBLIC_KEY
    )
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

  test("R1 signature recovers correct public key", () => {
    const pvt = PrivateKey.generate(KeyType.R1)
    const pub = pvt.toPublic()
    const sig = pvt.signMessage(message)
    const recovered = sig.recoverMessage(message)
    expect(recovered.data.array).toEqual(pub.data.array)
  })

  test("EM sign/verify message roundtrip", () => {
    const pvt = PrivateKey.generate(KeyType.EM)
    const pub = pvt.toPublic()
    const sig = pvt.signMessage(message)
    expect(sig.type).toBe(KeyType.EM)
    expect(sig.toString()).toMatch(/^SIG_EM_/)
    expect(sig.verifyMessage(message, pub)).toBe(true)
  })

  test("EM signature recovers correct public key from message", () => {
    const pvt = PrivateKey.generate(KeyType.EM)
    const pub = pvt.toPublic()
    const sig = pvt.signMessage(message)
    const recovered = sig.recoverMessage(message)
    expect(recovered.data.array).toEqual(pub.data.array)
  })

  test("EM signDigest verifies and recovers with digest APIs", () => {
    const pvt = PrivateKey.generate(KeyType.EM)
    const pub = pvt.toPublic()
    const digest = Checksum256.hash(message)
    const sig = pvt.signDigest(digest)
    const recovered = sig.recoverDigest(digest)

    expect(sig.verifyDigest(digest, pub)).toBe(true)
    expect(recovered.data.array).toEqual(pub.data.array)
  })

  test("EM signature roundtrips through string raw and ABI representations", () => {
    const pvt = PrivateKey.generate(KeyType.EM)
    const pub = pvt.toPublic()
    const sig = pvt.signMessage(message)
    const raw = hexToArray(sig.toHex().slice(2))
    const encoder = new ABIEncoder()
    sig.toABI(encoder)

    const roundtripped = [
      Signature.from(sig.toString()),
      Signature.fromRaw(raw, KeyType.EM),
      Signature.fromABI(new ABIDecoder(encoder.getData()))
    ]

    roundtripped.forEach(signature => {
      expect(signature.equals(sig)).toBe(true)
      expect(signature.verifyMessage(message, pub)).toBe(true)
    })
  })

  test("EM signatures match ethers EIP-191 known-answer vectors", () => {
    const pvt = PrivateKey.regenerate(
      KeyType.EM,
      hexToArray(EXTERNAL_EM_PRIVATE_KEY_HEX)
    )
    const pub = PublicKey.from({
      type: KeyType.EM,
      compressed: hexToArray(EXTERNAL_EM_PUBLIC_KEY_HEX)
    })
    const digest = Checksum256.hash(EXTERNAL_EM_MESSAGE)
    const externalMessageSig = Signature.from(EXTERNAL_EM_MESSAGE_SIGNATURE)
    const externalDigestSig = Signature.from(EXTERNAL_EM_DIGEST_SIGNATURE)

    expect(pvt.toPublic().equals(pub)).toBe(true)
    expect(digest.toString()).toBe(EXTERNAL_EM_DIGEST_HEX)
    expect(pvt.signMessage(EXTERNAL_EM_MESSAGE).toString()).toBe(
      EXTERNAL_EM_MESSAGE_SIGNATURE
    )
    expect(pvt.signDigest(digest).toString()).toBe(EXTERNAL_EM_DIGEST_SIGNATURE)
    expect(externalMessageSig.verifyMessage(EXTERNAL_EM_MESSAGE, pub)).toBe(
      true
    )
    expect(
      externalMessageSig.recoverMessage(EXTERNAL_EM_MESSAGE).equals(pub)
    ).toBe(true)
    expect(externalDigestSig.verifyDigest(digest, pub)).toBe(true)
    expect(externalDigestSig.recoverDigest(digest).equals(pub)).toBe(true)
  })

  test("EM verification fails with wrong public key", () => {
    const pvt1 = PrivateKey.generate(KeyType.EM)
    const pvt2 = PrivateKey.generate(KeyType.EM)
    const sig = pvt1.signMessage(message)
    expect(sig.verifyMessage(message, pvt2.toPublic())).toBe(false)
  })

  test("EM verification fails with wrong message", () => {
    const pvt = PrivateKey.generate(KeyType.EM)
    const pub = pvt.toPublic()
    const sig = pvt.signMessage(message)
    const wrong = new Uint8Array([0xca, 0xfe, 0xba, 0xbe])
    expect(sig.verifyMessage(wrong, pub)).toBe(false)
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

  test("K1 signatures preserve the elliptic compatibility vector", () => {
    const privateKey = PrivateKey.regenerate(
      KeyType.K1,
      COMPATIBILITY_K1_SECRET
    )

    expect(privateKey.signDigest(COMPATIBILITY_DIGEST).toString()).toBe(
      COMPATIBILITY_K1_SIGNATURE
    )
  })

  test("R1 signatures preserve the Noble compatibility vector", () => {
    const privateKey = PrivateKey.regenerate(
      KeyType.R1,
      COMPATIBILITY_R1_SECRET
    )

    expect(privateKey.signDigest(COMPATIBILITY_DIGEST).toString()).toBe(
      COMPATIBILITY_R1_SIGNATURE
    )
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

  test("K1 ECDH preserves the hashed compatibility vector", () => {
    const privateKey = PrivateKey.regenerate(
      KeyType.K1,
      COMPATIBILITY_K1_SECRET
    )
    const peer = PrivateKey.regenerate(KeyType.K1, COMPATIBILITY_K1_PEER_SECRET)

    expect(arrayToHex(privateKey.sharedSecret(peer.toPublic()).array)).toBe(
      COMPATIBILITY_K1_SHARED_SECRET
    )
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

    test("returns cached Noble implementations", () => {
      const k1 = getNobleCurve(KeyType.K1)
      const em = getNobleCurve(KeyType.EM)
      const r1 = getNobleCurve(KeyType.R1)

      expect(k1).toBe(em)
      expect(k1).toBe(getNobleCurve(KeyType.K1))
      expect(r1).toBe(getNobleCurve(KeyType.R1))
    })

    test("rejects ED keys for Noble Weierstrass operations", () => {
      expect(() => getNobleCurve(KeyType.ED)).toThrow()
    })
  })
})
