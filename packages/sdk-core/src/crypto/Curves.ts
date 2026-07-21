import { p256 } from "@noble/curves/nist.js"
import { secp256k1 } from "@noble/curves/secp256k1.js"
import { ec } from "elliptic"
import { match } from "ts-pattern"
import { KeyType } from "../chain/KeyType.js"

/** Cache of elliptic curve instances keyed by Wire key type. */
type EllipticCurveByKeyType = Partial<Record<KeyType, ec>>

/** Cache of Noble Weierstrass curve modules keyed by Wire key type. */
type NobleCurveByKeyType = Partial<Record<KeyType, typeof secp256k1>>

const curves: EllipticCurveByKeyType = {}
const nobleCurves: NobleCurveByKeyType = {}

/**
 * Get curve for key type.
 * @internal
 */
export function getCurve(type: KeyType): ec {
  let rv = curves[type]

  if (!rv) {
    rv = curves[type] = match(type)
      .with(KeyType.K1, KeyType.EM, () => new ec("secp256k1"))
      .with(KeyType.R1, () => new ec("p256"))
      .with(KeyType.ED, () => {
        throw new Error(
          "ED25519 keys are not supported via elliptic; use libsodium for ED-based operations"
        )
      })
      .otherwise(() => {
        throw new Error(`Unknown curve type: ${type}`)
      })
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
    curve = nobleCurves[type] = match(type)
      .with(KeyType.K1, KeyType.EM, () => secp256k1)
      .with(KeyType.R1, () => p256)
      .with(KeyType.ED, () => {
        throw new Error(
          "ED25519 keys are not supported via Noble Weierstrass curves"
        )
      })
      .otherwise(() => {
        throw new Error(`Unknown curve type: ${type}`)
      })
  }

  return curve
}
