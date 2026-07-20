import { getNobleCurve } from "./Curves.js"
import { KeyType } from "../chain/KeyType.js"
import nacl from "tweetnacl"
import { ethers } from "../EthersCompat.js"
import { blsVerify } from "./BLS.js"
import { match } from "ts-pattern"

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
  return match(type)
    .with(KeyType.ED, () =>
      nacl.sign.detached.verify(message, signature, pubkey)
    )
    .with(KeyType.EM, () => {
      const sigBytes = ethers.utils.arrayify(signature)
      const msgBytes = ethers.utils.arrayify(message)
      const recovered = ethers.utils.verifyMessage(msgBytes, sigBytes)
      const expected = ethers.utils.computeAddress(pubkey)
      return recovered.toLowerCase() === expected.toLowerCase()
    })
    .with(KeyType.BLS, () => blsVerify(signature, message, pubkey))
    .otherwise(() => {
      const compactSignature = signature.subarray(1)
      return getNobleCurve(type).verify(compactSignature, message, pubkey, {
        lowS: false
      })
    })
}
