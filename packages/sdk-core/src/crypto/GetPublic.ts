import { KeyType } from "../chain/KeyType"
import { getCurve } from "./Curves"
import nacl from "tweetnacl"
import { blsGetPublicKey, skFromLE } from "./BLS"

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
      // ECDSA public key via elliptic
      const curve = getCurve(type)
      const key = curve.keyFromPrivate(privkey)
      const point = key.getPublic()
      return new Uint8Array(point.encodeCompressed())
    }
  }
}
