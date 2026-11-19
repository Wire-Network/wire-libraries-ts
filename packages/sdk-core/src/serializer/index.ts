import { match } from "ts-pattern"

import { abiEncode } from "./Encoder.js"
import { abiDecode } from "./Decoder.js"
import {
  ABISerializable,
  ABISerializableConstructor,
  synthesizeABI
} from "./Serializable.js"

export { ABIEncoder } from "./Encoder.js"
export { ABIDecoder } from "./Decoder.js"
export type { ABIDecoderOptions } from "./Decoder.js"

export { ManualWriter } from "./Writer.js"

export type {
  ABISerializable,
  ABISerializableType,
  ABISerializableObject,
  ABISerializableConstructor
} from "./Serializable.js"

export namespace Serializer {
  export const encode = abiEncode
  export const decode = abiDecode
  /** Create an Antelope/SYSIO ABI definition for given core type. */
  export function synthesize(type: ABISerializableConstructor) {
    return synthesizeABI(type).abi
  }
  /** Create JSON representation of a core object. */
  export function stringify(object: ABISerializable) {
    return JSON.stringify(object)
  }
  /** Create a vanilla js representation of a core object. */
  export function objectify(object: ABISerializable) {
    const walk = (v: any): any =>
        match(typeof v)
          .with("boolean", "number", "string", () => v)
          .with("object", () => walkObject(v))
          .otherwise(() => undefined),
      walkObject = (v: any): any => {
        if (v === null) {
          return v
        }

        if (typeof v.toJSON === "function") {
          return walk(v.toJSON())
        }

        if (Array.isArray(v)) {
          return v.map(walk)
        }

        return Object.fromEntries(
          Object.keys(v).map(key => [key, walk(v[key])])
        )
      }

    return walk(object)
  }
}
