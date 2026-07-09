import { getCurve } from "./Curves.js"
import { KeyType } from "../chain/KeyType.js"
import nacl from "tweetnacl"
import { ethers } from "../EthersCompat.js"
import { blsVerify } from "./BLS.js"

/**
 * Verify signature using message and public key.
 *
 * For `KeyType.EM`, `signature` must be Ethereum compact bytes
 * `[r(32)||s(32)||v(1)]`; callers holding SDK wire bytes should convert
 * `[vWire||r||s]` before calling.
 *
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
