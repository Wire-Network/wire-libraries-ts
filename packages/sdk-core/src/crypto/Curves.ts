import { p256 } from "@noble/curves/nist.js"
import { secp256k1 } from "@noble/curves/secp256k1.js"
import { ec } from "elliptic"
import { KeyType } from "../chain/KeyType.js"

const curves: { [type: string]: ec } = {}
const nobleCurves: { [type: string]: typeof secp256k1 } = {}

/**
 * Get curve for key type.
 * @internal
 */
export function getCurve(type: KeyType): ec {
  let rv = curves[type]

  if (!rv) {
    switch (type) {
      case KeyType.K1:
      case KeyType.EM:
        rv = curves[type] = new ec("secp256k1")
        break
      case KeyType.R1:
        rv = curves[type] = new ec("p256")
        break
      case KeyType.ED:
        throw new Error(
          "ED25519 keys are not supported via elliptic; use libsodium for ED-based operations"
        )
      default:
        throw new Error(`Unknown curve type: ${type}`)
    }
  }

  return rv
}

/**
 * Get the Noble curve implementation for a classic key type.
 * @internal
 */
export function getNobleCurve(type: KeyType): typeof secp256k1 {
  let curve = nobleCurves[type]

  if (!curve) {
    switch (type) {
      case KeyType.K1:
      case KeyType.EM:
        curve = nobleCurves[type] = secp256k1
        break
      case KeyType.R1:
        curve = nobleCurves[type] = p256
        break
      case KeyType.ED:
        throw new Error(
          "ED25519 keys are not supported via Noble Weierstrass curves"
        )
      default:
        throw new Error(`Unknown curve type: ${type}`)
    }
  }

  return curve
}
