import "jest"
import { blsEncode, blsDecode } from "@wireio/sdk-core/crypto/BLSSerdes"
import { PrivateKey } from "@wireio/sdk-core/chain/PrivateKey"
import { PublicKey } from "@wireio/sdk-core/chain/PublicKey"
import { Signature } from "@wireio/sdk-core/chain/Signature"
import { KeyType } from "@wireio/sdk-core/chain/KeyType"
import { Bytes } from "@wireio/sdk-core/chain/Bytes"

describe("BLSSerdes", () => {
   test("roundtrip encode/decode 32 bytes", () => {
      const original = new Uint8Array(32)
      for (let i = 0; i < 32; i++) {
         original[i] = i
      }
      const encoded = blsEncode(original)
      const decoded = blsDecode(encoded, 32)
      expect(decoded).toEqual(original)
   })

   test("known encoding matches C++ output", () => {
      const hexKey = "dd551a492eed2234a0614e9cf2b8208d0c37868948b57c4f6d507e8a39e7295d"
      const data = new Uint8Array(hexKey.match(/.{2}/g)!.map((b) => parseInt(b, 16)))
      const encoded = blsEncode(data)
      const expected = "PVT_BLS_" + encoded
      expect(expected).toBe("PVT_BLS_3VUaSS7tIjSgYU6c8rggjQw3holItXxPbVB-ijnnKV3XTPWC")
   })

   test("bad checksum throws", () => {
      const data = new Uint8Array(32).fill(0x42)
      const encoded = blsEncode(data)
      // Tamper with last character of encoded string
      const chars = encoded.split("")
      const lastChar = chars[chars.length - 1]
      chars[chars.length - 1] = lastChar === "A" ? "B" : "A"
      const tampered = chars.join("")
      expect(() => blsDecode(tampered, 32)).toThrow()
   })
})

import { blsKeyGen, blsGetPublicKey, blsProofOfPossession, blsSign, blsVerify, skToLE } from "@wireio/sdk-core/crypto/BLS"
import { createHash } from "crypto"

function sha256(data: string): Uint8Array {
   return new Uint8Array(createHash("sha256").update(data).digest())
}

describe("BLS core crypto", () => {
   const seed = sha256("wire")

   test("keygen from sha256('wire') produces known SK", () => {
      const skBE = blsKeyGen(seed)
      const skLE = skToLE(skBE)
      expect(Buffer.from(skLE).toString("hex")).toBe(
         "dd551a492eed2234a0614e9cf2b8208d0c37868948b57c4f6d507e8a39e7295d"
      )
   })

   test("public key matches C++ output", () => {
      const skBE = blsKeyGen(seed)
      const pkLE = blsGetPublicKey(skBE)
      expect(Buffer.from(pkLE).toString("hex")).toBe(
         "de2826f72fa6de9a0340bf4853ea04d84deb8ca543d36e5a379fcaa6877c6952" +
         "a3aad838c4eacffa31adcf8c0b83f205cdcee06b2f5882163056035a7e9c698" +
         "44db1398e60cc43daf258b5ae6b457dda5782e0c584dc36169b8b59259a9a2f16"
      )
   })

   test("proof of possession matches C++ output", () => {
      const skBE = blsKeyGen(seed)
      const popLE = blsProofOfPossession(skBE)
      expect(popLE.length).toBe(192)
      const expectedEncoded =
         "qdQ36ASsBk_pJ9efSCZmSN5OcqNX7GIxjzpREX8TBOBVpUOheRfZmCGO7jay2lIZ" +
         "iD2vkrODGQDCsa3lfkB2FjhmoTce1TYpMOWv-PoPO4D36Y4yjItfa0iMgouirmcG_" +
         "rubUJDtgn0bHdvtroCc3HDoBHVeI994Ycs62RVJEROyTjIlTVGk3iXoAK9skkQKz3" +
         "DM3wT0yevxP_O47Ul85rJWnEVAlAjCUOsirAdu0yO1362pdnnl8kjXaPqEj_EYPvrRXw"
      const expectedBytes = blsDecode(expectedEncoded, 192)
      expect(Buffer.from(popLE).toString("hex")).toBe(
         Buffer.from(expectedBytes).toString("hex")
      )
   })

   test("sign and verify roundtrip", () => {
      const skBE = blsKeyGen(seed)
      const pkLE = blsGetPublicKey(skBE)
      const message = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
      const sigLE = blsSign(skBE, message)
      expect(sigLE.length).toBe(192)
      expect(blsVerify(sigLE, message, pkLE)).toBe(true)
   })

   test("verify rejects wrong message", () => {
      const skBE = blsKeyGen(seed)
      const pkLE = blsGetPublicKey(skBE)
      const message = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
      const sigLE = blsSign(skBE, message)
      const wrong = new Uint8Array([0xca, 0xfe])
      expect(blsVerify(sigLE, wrong, pkLE)).toBe(false)
   })
})

describe("BLS integration with high-level classes", () => {
   const seed = sha256("wire")
   const skBE = blsKeyGen(seed)
   const skLE = skToLE(skBE)

   const expectedPrivKey =
      "PVT_BLS_3VUaSS7tIjSgYU6c8rggjQw3holItXxPbVB-ijnnKV3XTPWC"
   const expectedPubKey =
      "PUB_BLS_3igm9y-m3poDQL9IU-oE2E3rjKVD025aN5_Kpod8aVKjqtg4xOrP-jGtz4wLg_IFzc7gay9YghYwVgNafpxphE2xOY5gzEPa8li1rmtFfdpXguDFhNw2FpuLWSWami8WXgUo3A"
   const expectedPOP =
      "SIG_BLS_qdQ36ASsBk_pJ9efSCZmSN5OcqNX7GIxjzpREX8TBOBVpUOheRfZmCGO7jay2lIZiD2vkrODGQDCsa3lfkB2FjhmoTce1TYpMOWv-PoPO4D36Y4yjItfa0iMgouirmcG_rubUJDtgn0bHdvtroCc3HDoBHVeI994Ycs62RVJEROyTjIlTVGk3iXoAK9skkQKz3DM3wT0yevxP_O47Ul85rJWnEVAlAjCUOsirAdu0yO1362pdnnl8kjXaPqEj_EYPvrRXw"

   test("PrivateKey from seed produces correct string", () => {
      const pvt = new PrivateKey(KeyType.BLS, new Bytes(skLE))
      expect(pvt.toString()).toBe(expectedPrivKey)
   })

   test("PrivateKey roundtrips through string", () => {
      const pvt = PrivateKey.from(expectedPrivKey)
      expect(pvt.type).toBe(KeyType.BLS)
      expect(pvt.toString()).toBe(expectedPrivKey)
   })

   test("PublicKey derivation produces correct string", () => {
      const pvt = PrivateKey.from(expectedPrivKey)
      const pub = pvt.toPublic()
      expect(pub.toString()).toBe(expectedPubKey)
   })

   test("PublicKey roundtrips through string", () => {
      const pub = PublicKey.from(expectedPubKey)
      expect(pub.type).toBe(KeyType.BLS)
      expect(pub.toString()).toBe(expectedPubKey)
   })

   test("Proof of possession matches C++ output", () => {
      const popLE = blsProofOfPossession(skBE)
      const popStr = "SIG_BLS_" + blsEncode(popLE)
      expect(popStr).toBe(expectedPOP)
   })

   test("Signature roundtrips through string", () => {
      const sig = Signature.from(expectedPOP)
      expect(sig.type).toBe(KeyType.BLS)
      expect(sig.toString()).toBe(expectedPOP)
   })

   test("BLS sign/verify roundtrip through high-level classes", () => {
      const pvt = PrivateKey.from(expectedPrivKey)
      const pub = pvt.toPublic()
      const message = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
      const sig = pvt.signMessage(message)
      expect(sig.type).toBe(KeyType.BLS)
      expect(sig.toString()).toMatch(/^SIG_BLS_/)
      expect(sig.verifyMessage(message, pub)).toBe(true)
   })

   test("BLS key generation produces unique keys", () => {
      const a = PrivateKey.generate(KeyType.BLS)
      const b = PrivateKey.generate(KeyType.BLS)
      expect(a.toString()).not.toBe(b.toString())
   })

   test("BLS recovery throws", () => {
      const pvt = PrivateKey.from(expectedPrivKey)
      const message = new Uint8Array([1, 2, 3])
      const sig = pvt.signMessage(message)
      expect(() => sig.recoverMessage(message)).toThrow()
   })
})
