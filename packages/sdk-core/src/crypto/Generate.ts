// src/crypto/generate.ts

import { KeyType } from "../chain/KeyType"
import { getCurve } from "./Curves"
import nacl from "tweetnacl"

/**
 * Generate a new private key for given type.
 * @internal
 */
export function generate(type: KeyType): Uint8Array {
  switch (type) {
    case KeyType.ED: // ED25519 private key via tweetnacl
      return nacl.sign.keyPair().secretKey // 64-byte secretKey = 32b seed + 32b pubkey

    case KeyType.EM: {
      // Ethereum-style secp256k1: generate 32 random bytes and validate on curve
      const curve = getCurve(type)
      let key: Uint8Array
      do {
        key = nacl.randomBytes(32)
      } while (!curve.keyFromPrivate(key).validate().result)
      return key
    }

    default: {
      // ECDSA curves (K1, R1)
      const curve = getCurve(type)
      const privkey = curve.genKeyPair().getPrivate()
      return privkey.toArrayLike(Uint8Array as any, "be", 32)
    }
  }
}
