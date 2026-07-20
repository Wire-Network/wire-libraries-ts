// src/crypto/generate.ts

import { match } from "ts-pattern"
import { KeyType } from "../chain/KeyType.js"
import { getNobleCurve } from "./Curves.js"
import nacl from "tweetnacl"
import { blsGenerate, skToLE } from "./BLS.js"

/**
 * Generate a new private key for given type.
 * @internal
 */
export function generate(type: KeyType): Uint8Array {
  return match(type)
    .with(KeyType.ED, () => nacl.sign.keyPair().secretKey)
    .with(KeyType.EM, () => getNobleCurve(type).utils.randomSecretKey())
    .with(KeyType.BLS, () => skToLE(blsGenerate()))
    .otherwise(() => getNobleCurve(type).utils.randomSecretKey())
}
