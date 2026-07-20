import { match } from "ts-pattern"
import { KeyType } from "../chain/KeyType.js"
import { getNobleCurve } from "./Curves.js"
import nacl from "tweetnacl"
import { blsGetPublicKey, skFromLE } from "./BLS.js"

/**
 * Get public key corresponding to given private key.
 * @internal
 */
export function getPublic(privkey: Uint8Array, type: KeyType) {
  return match(type)
    .with(KeyType.ED, () => nacl.sign.keyPair.fromSecretKey(privkey).publicKey)
    .with(KeyType.BLS, () => blsGetPublicKey(skFromLE(privkey)))
    .otherwise(() => getNobleCurve(type).getPublicKey(privkey, true))
}
