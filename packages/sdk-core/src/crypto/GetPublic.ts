import { KeyType } from "../chain/KeyType.js"
import { getNobleCurve } from "./Curves.js"
import nacl from "tweetnacl"
import { blsGetPublicKey, skFromLE } from "./BLS.js"

/**
 * Get public key corresponding to given private key.
 * @internal
 */
export function getPublic(privkey: Uint8Array, type: KeyType) {
  switch (type) {
    case KeyType.ED: // Derive ED25519 public key via tweetnacl
      return nacl.sign.keyPair.fromSecretKey(privkey).publicKey

    case KeyType.BLS:
      return blsGetPublicKey(skFromLE(privkey))

    default: {
      return getNobleCurve(type).getPublicKey(privkey, true)
    }
  }
}
