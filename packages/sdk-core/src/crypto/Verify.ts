import { getCurve } from "./Curves"
import { KeyType } from "../chain/KeyType"
import nacl from "tweetnacl"
import { ethers } from "ethers"
import { blsVerify } from "./BLS"

/**
 * Verify signature using message and public key.
 * @internal
 */
export function verify(
  signature: Uint8Array,
  message: Uint8Array,
  pubkey: Uint8Array,
  type: KeyType
): boolean {
  switch (type) {
    case KeyType.ED: // ED25519 detached verification via tweetnacl
      return nacl.sign.detached.verify(message, signature, pubkey)

    case KeyType.EM: {
      const sigBytes = ethers.utils.arrayify(signature)
      const msgBytes = ethers.utils.arrayify(message)
      const recovered = ethers.utils.verifyMessage(msgBytes, sigBytes)
      const expected = ethers.utils.computeAddress(pubkey)
      return recovered.toLowerCase() === expected.toLowerCase()
    }

    case KeyType.BLS:
      return blsVerify(signature, message, pubkey)

    default: {
      // ECDSA verification using elliptic
      const curve = getCurve(type)
      const r = signature.subarray(1, 33)
      const s = signature.subarray(33, 65)
      return curve.verify(message, { r, s }, pubkey as any)
    }
  }
}
