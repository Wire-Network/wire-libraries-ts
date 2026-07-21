import { match } from "ts-pattern"
import { ethers } from "../EthersCompat.js"
import { Bytes } from "../chain/Bytes.js"
import { KeyType } from "../chain/KeyType.js"
import { PublicKey } from "../chain/PublicKey.js"
import { getNobleCurve } from "./Curves.js"
import { bytesToNumberBE } from "@noble/curves/utils.js"

/**
 * Recover compressed public key from signature and recovery id.
 *
 * `signature` must be SDK wire bytes `[vWire||r||s]` for EM/K1/R1. EM
 * recovery converts those bytes to Ethereum compact `[r||s||v]` internally
 * before applying EIP-191 recovery.
 *
 * @internal
 */
export function recover(
  signature: Uint8Array,
  message: Uint8Array,
  type: KeyType
): PublicKey {
  return match(type)
    .with(KeyType.ED, () => {
      throw new Error("ED25519 does not support public key recovery")
    })
    .with(KeyType.BLS, () => {
      throw new Error("BLS does not support public key recovery")
    })
    .with(KeyType.EM, () => {
      // wire: [vWire(31/32)‖r(32)‖s(32)]
      const vRaw = signature[0] - 4 // 27/28
      const r = signature.subarray(1, 33)
      const s = signature.subarray(33, 65)

      const sigHex = ethers.utils.hexlify(Uint8Array.from([...r, ...s, vRaw]))
      const msgHash = ethers.utils.hashMessage(message)
      const uncompressed = ethers.utils.recoverPublicKey(msgHash, sigHex)
      const compressed = ethers.utils.computePublicKey(uncompressed, true) // hex
      return new PublicKey(
        KeyType.EM,
        new Bytes(ethers.utils.arrayify(compressed))
      )
    })
    .otherwise(() => {
      // wire: [vWire(31/32)‖r‖s]
      const recid = signature[0] - 31
      const curve = getNobleCurve(type)
      const recoveredSignature = new curve.Signature(
        bytesToNumberBE(signature.subarray(1, 33)),
        bytesToNumberBE(signature.subarray(33, 65)),
        recid
      )
      const compressed = recoveredSignature
        .recoverPublicKey(message)
        .toBytes(true)
      return new PublicKey(type, new Bytes(compressed))
    })
}
