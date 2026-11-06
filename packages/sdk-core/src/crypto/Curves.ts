import { p256 } from "@noble/curves/nist.js"
import { secp256k1 } from "@noble/curves/secp256k1.js"
import elliptic, { type ec } from "elliptic"
import { match } from "ts-pattern"
import { KeyType } from "../chain/KeyType.js"

const curves: Partial<Record<KeyType, ec>> = {}
const nobleCurves: Partial<Record<KeyType, typeof secp256k1>> = {}

/** Get the cached elliptic implementation for a classic key type. @internal */
export function getCurve(type: KeyType): ec {
  let curve = curves[type]
  if (!curve) {
    curve = curves[type] = match(type)
      .with(KeyType.K1, KeyType.EM, () => new elliptic.ec("secp256k1"))
      .with(KeyType.R1, () => new elliptic.ec("p256"))
      .with(KeyType.ED, () => {
        throw new Error("ED25519 keys are not supported via elliptic")
      })
      .otherwise(() => {
        throw new Error(`Unknown curve type: ${type}`)
      })
  }
  return curve
}

/** Get the cached Noble implementation for a classic key type. @internal */
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
