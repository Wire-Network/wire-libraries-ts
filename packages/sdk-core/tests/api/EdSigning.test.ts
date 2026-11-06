import nacl from "tweetnacl"
import { sign as signParts } from "@wireio/sdk-core/crypto/Sign"
import { APIClient } from "@wireio/sdk-core/api/Client"
import { Action } from "@wireio/sdk-core/chain/Action"
import { Bytes } from "@wireio/sdk-core/chain/Bytes"
import { KeyType } from "@wireio/sdk-core/chain/KeyType"
import { PublicKey } from "@wireio/sdk-core/chain/PublicKey"
import { PrivateKey } from "@wireio/sdk-core/chain/PrivateKey"
import { Signature } from "@wireio/sdk-core/chain/Signature"
import {
  CompressionType,
  PackedTransaction,
  SignedTransaction
} from "@wireio/sdk-core/chain/Transaction"
import { abiEncode } from "@wireio/sdk-core/serializer/Encoder"
import { abiDecode } from "@wireio/sdk-core/serializer/Decoder"
import { GetInfoResponse } from "@wireio/sdk-core/api/v1/Types"
import { createEmptyTransaction } from "../support/transactions.js"
import { createClassicSigner } from "@wireio/sdk-core/signing/SignerProvider"

const pair = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(7))
const key = new PublicKey(KeyType.ED, pair.publicKey)
const chainId = "ab".repeat(32)
const action = Action.from({
  account: "sysio.token",
  name: "transfer",
  authorization: [{ actor: "alice", permission: "active" }],
  data: "00"
})
/** Deterministic RPC fixture; never broadcasts. */
function client() {
  const sign = jest.fn(async (message: string | Uint8Array) =>
    nacl.sign.detached(Bytes.from(message).array, pair.secretKey)
  )
  const api = new APIClient({
    url: "https://wire.invalid",
    signer: { pubKey: key, sign }
  })
  jest.spyOn(api, "anyToAction").mockResolvedValue([action])
  jest.spyOn(api.v1.chain, "get_info").mockResolvedValue({
    chain_id: chainId,
    getTransactionHeader: () => ({
      expiration: "2026-11-06T00:00:00",
      ref_block_num: 1,
      ref_block_prefix: 2
    })
  } as unknown as GetInfoResponse)
  return { api, sign }
}

describe("Current Wire ED transaction signatures", () => {
  test("parses canonical ED authorities and rejects invalid key lengths before serialization", () => {
    expect(PublicKey.from(key.toString()).equals(key)).toBe(true)
    expect(
      abiDecode({ data: abiEncode({ object: key }), type: PublicKey }).equals(
        key
      )
    ).toBe(true)
    expect(() => PublicKey.from("PUB_ED_foo")).toThrow(
      /ED public key must be 32 bytes/
    )
    expect(() => new PublicKey(KeyType.ED, new Uint8Array(31))).toThrow(
      /32 bytes/
    )
    expect(() => new PublicKey(KeyType.ED, new Uint8Array(33))).toThrow(
      /32 bytes/
    )
  })
  test("low-level ED signing composes directly with Signature.from", () => {
    const message = Bytes.from("external message", "utf8")
    const signature = Signature.from(
      signParts(pair.secretKey, message.array, KeyType.ED)
    )
    expect(signature.data.length).toBe(96)
    expect(signature.verifyMessage(message, key)).toBe(true)
    expect(signature.recoverMessage(message).equals(key)).toBe(true)
  })
  test.each([CompressionType.none, CompressionType.zlib])(
    "preserves the full 96-byte signature through packing and ABI decoding (%s)",
    async compression => {
      const { api, sign } = client()
      const signed = await api.buildSignedTransaction(action)
      expect(signed.transaction_extensions).toEqual([])
      expect(sign).toHaveBeenCalledTimes(1)
      const signature = signed.signatures[0]
      expect(signature.data.length).toBe(96)
      expect(signature.data.array.slice(0, 32)).toEqual(pair.publicKey)
      expect(
        nacl.sign.detached.verify(
          signed.signingDigest(chainId, KeyType.ED).msgBytes,
          signature.data.array.slice(32),
          pair.publicKey
        )
      ).toBe(true)
      expect(
        signature
          .recoverDigest(signed.signingDigest(chainId).msgDigest)
          .equals(key)
      ).toBe(true)
      expect(Signature.from(signature.toString()).equals(signature)).toBe(true)
      expect(
        abiDecode({
          data: abiEncode({ object: signature }),
          type: Signature
        }).equals(signature)
      ).toBe(true)
      const packed = PackedTransaction.fromSigned(signed, compression)
      expect(
        packed.getSignedTransaction().signatures[0].equals(signature)
      ).toBe(true)
      expect(packed.getTransaction().id.equals(signed.id)).toBe(true)
    }
  )
  test("classic ED signing uses the same native message domain as an external wallet", async () => {
    const { api } = client()
    api.setSigner(
      createClassicSigner(new PrivateKey(KeyType.ED, new Bytes(pair.secretKey)))
    )
    const signed = await api.buildSignedTransaction(action)
    expect(
      signed.signatures[0].verifyDigest(
        signed.signingDigest(chainId).msgDigest,
        key
      )
    ).toBe(true)
  })
  test("rejects truncated, padded, mismatched and rejected signatures before packing", async () => {
    const { api, sign } = client()
    sign.mockResolvedValueOnce(new Uint8Array(65))
    await expect(api.buildSignedTransaction(action)).rejects.toThrow(
      /ED signatures require/
    )
    sign.mockRejectedValueOnce(new Error("User rejected"))
    await expect(api.buildSignedTransaction(action)).rejects.toThrow(
      /transaction signing failed/
    )
    expect(() => Signature.fromRaw(new Uint8Array(64), KeyType.ED)).toThrow(
      /ED signatures require/
    )
    expect(() =>
      Signature.fromRaw(new Uint8Array(96), KeyType.ED, key)
    ).toThrow(/does not match/)
    expect(() => new Signature(KeyType.ED, new Uint8Array(65))).toThrow(
      /96 bytes/
    )
  })
  test("verification rejects a different key or altered message", () => {
    const message = Bytes.from("message", "utf8")
    const signature = Signature.fromRaw(
      nacl.sign.detached(message.array, pair.secretKey),
      KeyType.ED,
      key
    )
    expect(signature.verifyMessage(message, key)).toBe(true)
    expect(signature.recoverMessage(message).equals(key)).toBe(true)
    expect(signature.verifyMessage(Bytes.from("other", "utf8"), key)).toBe(
      false
    )
    expect(
      signature.verifyMessage(
        message,
        new PublicKey(KeyType.ED, new Uint8Array(32))
      )
    ).toBe(false)
  })
})

/** Packing and the corrected unsigned digest must preserve the other key families. */
describe("Shared transaction codec compatibility", () => {
  test.each([KeyType.K1, KeyType.R1, KeyType.EM, KeyType.BLS])(
    "preserves %s signing and mixed ED signature-array boundaries",
    type => {
      const transaction = createEmptyTransaction()
      const digest = transaction.signingDigest(chainId).msgDigest
      const privateKey = PrivateKey.generate(type)
      const signature = privateKey.signDigest(digest)
      const edSignature = new PrivateKey(
        KeyType.ED,
        new Bytes(pair.secretKey)
      ).signDigest(digest)
      const signed = SignedTransaction.from({
        ...transaction,
        signatures: [edSignature, signature]
      })
      expect(signed.signingDigest(chainId).msgDigest.equals(digest)).toBe(true)
      expect(signature.verifyDigest(digest, privateKey.toPublic())).toBe(true)
      const decoded = abiDecode({
        data: abiEncode({ object: signed }),
        type: SignedTransaction
      })
      expect(decoded.signatures.map(value => value.toString())).toEqual(
        signed.signatures.map(value => value.toString())
      )
      ;[CompressionType.none, CompressionType.zlib].forEach(compression => {
        const packed = PackedTransaction.fromSigned(signed, compression)
        expect(
          packed
            .getSignedTransaction()
            .signatures.map(value => value.toString())
        ).toEqual(signed.signatures.map(value => value.toString()))
        expect(packed.getTransaction().id.equals(transaction.id)).toBe(true)
      })
    }
  )
})
