// src/crypto/shared-secret.ts

import { match } from "ts-pattern"
import { KeyType } from "../chain/KeyType.js"
import { getNobleCurve } from "./Curves.js"

/** Number of prefix bytes in a compressed Weierstrass public key. */
const COMPRESSED_PUBLIC_KEY_PREFIX_BYTES = 1

/** Preserve elliptic's minimal big-endian shared-secret encoding. */
function trimLeadingZeroBytes(value: Uint8Array): Uint8Array {
  const firstNonzeroIndex = value.findIndex(byte => byte !== 0)
  return firstNonzeroIndex > 0 ? value.subarray(firstNonzeroIndex) : value
}

/**
 * Derive shared secret for key pair.
 * @internal
 */
export function sharedSecret(
  privkey: Uint8Array,
  pubkey: Uint8Array,
  type: KeyType
): Uint8Array {
  return match(type)
    .with(KeyType.ED, () => {
      // ED25519 does not support ECDH-derived shared secrets
      throw new Error(
        "Shared secret (ECDH) not supported for ED25519; convert to X25519 first"
      )
    })
    .with(KeyType.BLS, () => {
      throw new Error("BLS does not support shared secret")
    })
    .otherwise(() => {
      const sharedPoint = getNobleCurve(type).getSharedSecret(
        privkey,
        pubkey,
        true
      )
      return trimLeadingZeroBytes(
        sharedPoint.subarray(COMPRESSED_PUBLIC_KEY_PREFIX_BYTES)
      )
    })
}
