import { Bytes } from "@wireio/sdk-core/chain/Bytes"
import { Checksum256 } from "@wireio/sdk-core/chain/Checksum"
import { KeyType } from "@wireio/sdk-core/chain/KeyType"
import { PrivateKey } from "@wireio/sdk-core/chain/PrivateKey"
import { Signature } from "@wireio/sdk-core/chain/Signature"
import { createClassicSigner } from "@wireio/sdk-core/signing/SignerProvider"
import { arrayToHex } from "@wireio/sdk-core/Utils"

describe("SignerProvider", () => {
  describe("createClassicSigner", () => {
    test("creates from private key string and signs digest bytes and hex", async () => {
      const privateKey = PrivateKey.generate(KeyType.K1)
      const signer = createClassicSigner(privateKey.toString())
      const digest = Checksum256.hash(Bytes.from("classic signer", "utf8")).array

      const sigFromBytes = await signer.sign(digest)
      const sigFromHex = await signer.sign(arrayToHex(digest))

      expect(sigFromBytes).toEqual(sigFromHex)
      expect(sigFromHex.length).toBe(65)

      const signature = Signature.fromRaw(sigFromHex, KeyType.K1)
      expect(signature.verifyDigest(digest, signer.pubKey)).toBe(true)
    })
  })
})
