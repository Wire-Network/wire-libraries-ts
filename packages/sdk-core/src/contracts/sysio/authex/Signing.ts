import { ethers } from "ethers"

import { Bytes } from "../../../chain/Bytes.js"
import { KeyType } from "../../../chain/KeyType.js"
import { Name, type NameType } from "../../../chain/Name.js"
import { PublicKey, type PublicKeyType } from "../../../chain/PublicKey.js"
import { Signature } from "../../../chain/Signature.js"
import type { SignerProvider } from "../../../signing/SignerProvider.js"
import type * as SystemContracts from "../../../types/SystemContractTypes.js"

import {
  AUTHEX_CREATE_LINK_AUTH_SUFFIX,
  SOLANA_DIGEST_PRINTABLE_MIN,
  SOLANA_DIGEST_PRINTABLE_RANGE
} from "./Constants.js"
import type {
  AuthexSupportedLinkChainKind,
  PreparedCreateLink,
  PrepareCreateLinkOptions,
  SignedCreateLinkProof
} from "./Types.js"

/** Returns true when the chain kind can be created by the user-facing link flow. */
export function isSupportedCreateLinkChainKind(
  chainKind: SystemContracts.SysioAuthexChainkind
): chainKind is AuthexSupportedLinkChainKind {
  return (
    chainKind === 2 ||
    chainKind === 3
  )
}

/** Normalizes and validates a user-facing create-link chain kind. */
export function requireSupportedCreateLinkChainKind(
  chainKind: SystemContracts.SysioAuthexChainkind
): AuthexSupportedLinkChainKind {
  if (!isSupportedCreateLinkChainKind(chainKind)) {
    throw new Error("AuthEx create-link supports only EVM(2) and SVM(3).")
  }

  return chainKind
}

/** Builds the exact `sysio.authex::createlink` message before chain-specific hashing. */
export function buildCreateLinkMessage(
  publicKey: PublicKeyType,
  account: NameType,
  chainKind: SystemContracts.SysioAuthexChainkind,
  nonce: number
): string {
  return [
    PublicKey.from(publicKey).toString(),
    Name.from(account).toString(),
    requireSupportedCreateLinkChainKind(chainKind),
    nonce,
    AUTHEX_CREATE_LINK_AUTH_SUFFIX
  ].join("|")
}

/** Validates that the supplied public key curve matches the link chain kind. */
export function assertCreateLinkPublicKeyMatchesChain(
  publicKey: PublicKey,
  chainKind: AuthexSupportedLinkChainKind
): void {
  if (chainKind === 2 && publicKey.type !== KeyType.EM) {
    throw new Error("EVM AuthEx links require a PUB_EM public key.")
  }

  if (chainKind === 3 && publicKey.type !== KeyType.ED) {
    throw new Error("SVM AuthEx links require a PUB_ED public key.")
  }
}

/** Returns the byte payload the external wallet signs for the create-link proof. */
export function createLinkSigningPayload(
  message: string,
  chainKind: AuthexSupportedLinkChainKind
): Uint8Array {
  if (chainKind === 2) {
    return ethers.utils.arrayify(
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes(message))
    )
  }

  const hashBytes = ethers.utils.arrayify(
      ethers.utils.sha256(ethers.utils.toUtf8Bytes(message))
    ),
    mapped = new Uint8Array(hashBytes.length)

  hashBytes.forEach((byte, index) => {
    mapped[index] = SOLANA_DIGEST_PRINTABLE_MIN + (byte % SOLANA_DIGEST_PRINTABLE_RANGE)
  })

  return ethers.utils.toUtf8Bytes(ethers.utils.hexlify(mapped).slice(2))
}

/** Prepares create-link message and wallet-signing payload without signing it. */
export function prepareCreateLink(options: PrepareCreateLinkOptions): PreparedCreateLink {
  const chainKind = requireSupportedCreateLinkChainKind(options.chainKind),
    publicKey = PublicKey.from(options.publicKey),
    account = Name.from(options.account).toString(),
    nonce = options.nonce || Date.now()

  assertCreateLinkPublicKeyMatchesChain(publicKey, chainKind)

  const publicKeyString = publicKey.toString(),
    message = buildCreateLinkMessage(publicKeyString, account, chainKind, nonce)

  return {
    account,
    chainKind,
    publicKey: publicKeyString,
    nonce,
    message,
    signingPayload: createLinkSigningPayload(message, chainKind)
  }
}

/** Converts an external-wallet raw signature into the Wire signature expected by AuthEx. */
export function createLinkSignatureFromRaw(
  rawSignature: Uint8Array,
  publicKey: PublicKeyType,
  chainKind: AuthexSupportedLinkChainKind
): Signature {
  const key = PublicKey.from(publicKey)

  assertCreateLinkPublicKeyMatchesChain(key, chainKind)

  if (chainKind === 2) {
    return Signature.fromRaw(rawSignature, KeyType.EM)
  }

  if (rawSignature.length === 96) {
    return new Signature(KeyType.ED, Bytes.from(rawSignature))
  }

  if (rawSignature.length !== 64) {
    throw new Error(`SVM AuthEx signatures must be 64 or 96 bytes, got ${rawSignature.length}.`)
  }

  const signature96 = new Uint8Array(96)
  signature96.set(key.data.array, 0)
  signature96.set(rawSignature, 32)

  return new Signature(KeyType.ED, Bytes.from(signature96))
}

/** Signs the create-link proof with the supplied external-wallet signer. */
export async function signCreateLink(
  options: Omit<PrepareCreateLinkOptions, "publicKey"> & {
    signer: SignerProvider
    publicKey?: PublicKeyType
  }
): Promise<SignedCreateLinkProof> {
  const prepared = prepareCreateLink({
      account: options.account,
      chainKind: options.chainKind,
      publicKey: options.publicKey || options.signer.pubKey,
      nonce: options.nonce
    }),
    signature = createLinkSignatureFromRaw(
      await options.signer.sign(prepared.signingPayload),
      prepared.publicKey,
      prepared.chainKind
    )

  return {
    ...prepared,
    signature: signature.toString()
  }
}
