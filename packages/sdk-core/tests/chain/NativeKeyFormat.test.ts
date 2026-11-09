import { Base58, KeyType, PrivateKey, PublicKey } from "@wireio/sdk-core"

describe("native key formats", () => {
  it("uses prefixed R1 keys instead of unsupported K1 encodings", () => {
    const key = PrivateKey.generate(KeyType.R1),
      pub = key.toPublic()
    expect(key.toNativeString()).toBe(key.toString())
    expect(pub.toNativeString()).toBe(pub.toString())
    expect(PrivateKey.from(key.toNativeString()).toString()).toBe(
      key.toString()
    )
    expect(PublicKey.from(pub.toNativeString()).toString()).toBe(pub.toString())
  })

  it("preserves K1 daemon and external-chain encodings", () => {
    const k1 = PrivateKey.generate(KeyType.K1),
      em = PrivateKey.generate(KeyType.EM),
      ed = PrivateKey.generate(KeyType.ED),
      bls = PrivateKey.generate(KeyType.BLS)
    expect(k1.toNativeString()).toBe(k1.toWif())
    expect(k1.toPublic().toNativeString()).toBe(k1.toPublic().toLegacyString())
    expect(em.toNativeString()).toBe("0x" + em.data.hexString)
    expect(em.toPublic().toNativeString()).toBe(
      "0x" + em.toPublic().data.hexString
    )
    expect(em.toPublic().toNativeString()).toHaveLength(68)
    expect(ed.toNativeString()).toBe(Base58.encode(ed.data))
    expect(ed.toPublic().toNativeString()).toBe(
      Base58.encode(ed.toPublic().data)
    )
    expect(bls.toNativeString()).toBe(bls.toString())
    expect(bls.toPublic().toNativeString()).toBe(bls.toPublic().toString())
  })
})
