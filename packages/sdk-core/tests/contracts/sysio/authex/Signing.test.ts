import { arrayify, hexlify, joinSignature } from "@ethersproject/bytes"
import { hashMessage } from "@ethersproject/hash"
import { keccak256 } from "@ethersproject/keccak256"
import { sha256 } from "@ethersproject/sha2"
import { SigningKey } from "@ethersproject/signing-key"
import { toUtf8Bytes } from "@ethersproject/strings"
import nacl from "tweetnacl"

import { Bytes } from "@wireio/sdk-core/chain/Bytes"
import { KeyType } from "@wireio/sdk-core/chain/KeyType"
import { PublicKey } from "@wireio/sdk-core/chain/PublicKey"
import { Signature } from "@wireio/sdk-core/chain/Signature"
import { contracts } from "@wireio/sdk-core"
import { SysioAuthexChainkind } from "@wireio/sdk-core/types/SysioContractTypes"

const {
  assertCreateLinkPublicKeyMatchesChain,
  assertSupportedCreateLinkChainKind,
  buildCreateLinkMessage,
  createLinkSignatureFromRaw,
  createLinkSigningPayload,
  prepareCreateLink,
  signCreateLink
} = contracts.sysio.authex

const EVM = SysioAuthexChainkind.CHAIN_KIND_EVM,
  SVM = SysioAuthexChainkind.CHAIN_KIND_SVM,
  NONCE = 1_720_000_000_000,
  EVM_PRIVATE_KEY = `0x${"01".repeat(32)}`

/** Creates the deterministic compressed EM public key used by the vectors. */
function ethereumFixture() {
  const signingKey = new SigningKey(EVM_PRIVATE_KEY),
    publicKey = new PublicKey(
      KeyType.EM,
      arrayify(signingKey.compressedPublicKey)
    )

  return { signingKey, publicKey }
}

/** Signs a payload in the EIP-191 domain used by injected Ethereum wallets. */
function signEthereumPayload(
  signingKey: SigningKey,
  payload: Uint8Array
): Uint8Array {
  return arrayify(joinSignature(signingKey.signDigest(hashMessage(payload))))
}

/** Creates the deterministic ED key pair used by the vectors. */
function solanaFixture() {
  const pair = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(7)),
    publicKey = new PublicKey(KeyType.ED, pair.publicKey)

  return { pair, publicKey }
}

describe("AuthEx create-link signing", () => {
  test("accepts only the generated EVM and SVM chain kinds", () => {
    expect(assertSupportedCreateLinkChainKind(EVM)).toBe(EVM)
    expect(assertSupportedCreateLinkChainKind(SVM)).toBe(SVM)
    expect(() =>
      assertSupportedCreateLinkChainKind(SysioAuthexChainkind.CHAIN_KIND_WIRE)
    ).toThrow("supports only EVM(2) and SVM(3)")
  })

  test("builds the exact deployed create-link message", () => {
    const { publicKey } = ethereumFixture()

    expect(buildCreateLinkMessage(publicKey, "alice", EVM, NONCE)).toBe(
      `${publicKey.toString()}|alice|2|${NONCE}|createlink auth`
    )
  })

  test("prepares and verifies an EVM personal-sign proof", async () => {
    const { signingKey, publicKey } = ethereumFixture(),
      prepared = prepareCreateLink({
        account: "alice",
        chainKind: EVM,
        publicKey,
        nonce: NONCE
      }),
      expectedDigest = arrayify(keccak256(toUtf8Bytes(prepared.message))),
      rawSignature = signEthereumPayload(signingKey, prepared.signingPayload),
      signature = createLinkSignatureFromRaw(rawSignature, publicKey, EVM)

    expect(prepared.signingPayload).toEqual(expectedDigest)
    expect(signature.type).toBe(KeyType.EM)
    expect(signature.data.length).toBe(65)
    expect(signature.verifyMessage(prepared.signingPayload, publicKey)).toBe(
      true
    )
  })

  test("prepares the lowercase-hex printable digest required by SVM recovery", () => {
    const { publicKey } = solanaFixture(),
      prepared = prepareCreateLink({
        account: "alice",
        chainKind: SVM,
        publicKey,
        nonce: NONCE
      }),
      digest = arrayify(sha256(toUtf8Bytes(prepared.message))),
      mapped = Uint8Array.from(digest, byte => 33 + (byte % 94)),
      expected = toUtf8Bytes(hexlify(mapped).slice(2))

    expect(prepared.signingPayload).toEqual(expected)
    expect(prepared.signingPayload).toHaveLength(64)
  })

  test("embeds the ED public key ahead of a Solana wallet signature", () => {
    const { pair, publicKey } = solanaFixture(),
      payload = createLinkSigningPayload("proof", SVM),
      rawSignature = nacl.sign.detached(payload, pair.secretKey),
      wireSignature = createLinkSignatureFromRaw(rawSignature, publicKey, SVM)

    expect(wireSignature.type).toBe(KeyType.ED)
    expect(wireSignature.data.length).toBe(96)
    expect(wireSignature.data.array.slice(0, 32)).toEqual(publicKey.data.array)
    expect(wireSignature.data.array.slice(32)).toEqual(rawSignature)
    expect(
      Signature.fromRaw(rawSignature, KeyType.ED).verifyMessage(
        Bytes.from(payload),
        publicKey
      )
    ).toBe(true)
  })

  test("rejects public-key curves that do not match the external chain", () => {
    const { publicKey: ethereumPublicKey } = ethereumFixture(),
      { publicKey: solanaPublicKey } = solanaFixture()

    expect(() =>
      assertCreateLinkPublicKeyMatchesChain(solanaPublicKey, EVM)
    ).toThrow("PUB_EM")
    expect(() =>
      assertCreateLinkPublicKeyMatchesChain(ethereumPublicKey, SVM)
    ).toThrow("PUB_ED")
  })

  test("signs through a wallet-neutral signer provider", async () => {
    const { signingKey, publicKey } = ethereumFixture(),
      signer = {
        pubKey: publicKey,
        sign: jest.fn(async (payload: Uint8Array) =>
          signEthereumPayload(signingKey, payload)
        )
      },
      proof = await signCreateLink({
        account: "alice",
        chainKind: EVM,
        signer,
        nonce: NONCE
      })

    expect(signer.sign).toHaveBeenCalledWith(proof.signingPayload)
    expect(proof.signature).toMatch(/^SIG_EM_/)
    expect(proof.publicKey).toBe(publicKey.toString())
  })
})
