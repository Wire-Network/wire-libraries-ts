import { abiEncode } from "./Encoder.js"
import { abiDecode } from "./Decoder.js"
import {
  ABISerializable,
  ABISerializableConstructor,
  synthesizeABI
} from "./Serializable.js"

export { ABIEncoder } from "./Encoder.js"
export { ABIDecoder } from "./Decoder.js"

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
    const walk = (v: any) => {
      switch (typeof v) {
        case "boolean":
        case "number":
        case "string":
          return v

        case "object": {
          if (v === null) {
            return v
          }

          if (typeof v.toJSON === "function") {
            return walk(v.toJSON())
          }

          if (Array.isArray(v)) {
            return v.map(walk)
          }

          const rv: any = {}

          for (const key of Object.keys(v)) {
            rv[key] = walk(v[key])
          }

          return rv
        }
      }
    }

    return walk(object)
  }
}
