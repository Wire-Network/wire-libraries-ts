// src/crypto/generate.ts

import { KeyType } from "../chain/KeyType.js"
import { getNobleCurve } from "./Curves.js"
import nacl from "tweetnacl"
import { blsGenerate, skToLE } from "./BLS.js"

/**
 * Generate a new private key for given type.
 * @internal
 */
export function generate(type: KeyType): Uint8Array {
  switch (type) {
    case KeyType.ED: // ED25519 private key via tweetnacl
      return nacl.sign.keyPair().secretKey // 64-byte secretKey = 32b seed + 32b pubkey

    case KeyType.EM: {
      return getNobleCurve(type).utils.randomSecretKey()
    }

    case KeyType.BLS:
      return skToLE(blsGenerate())

    default: {
      return getNobleCurve(type).utils.randomSecretKey()
    }
  }
}
