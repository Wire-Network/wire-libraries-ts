/**
 * Antelope/SYSIO ABI Decoder
 */

import { ABI, ABIDef } from "../chain/Abi.js"
import { Bytes, BytesType } from "../chain/Bytes.js"
import { Variant } from "../chain/Variant.js"

import {
  ABISerializable,
  ABISerializableConstructor,
  ABISerializableType,
  abiTypeString,
  synthesizeABI,
  toTypeDescriptor
} from "./Serializable.js"

import {
  buildTypeLookup,
  BuiltinTypes,
  getTypeName,
  TypeLookup
} from "./Builtins.js"

import { isInstanceOf } from "../Utils.js"

interface DecodeArgsBase {
  abi?: ABIDef
  data?: BytesType | ABIDecoder
  json?: string
  object?: any
  customTypes?: ABISerializableConstructor[]
  /** Optional encoder metadata. */
  metadata?: Record<string, any>
  /**
   * Binary extension handling, if set to true missing extensions will be initialized,
   * otherwise they will be set to null. Defaults to false.
   */
  strictExtensions?: boolean
  /**
   * Set to ignore invalid UTF-8, otherwise an error will be thrown (default).
   */
  ignoreInvalidUTF8?: boolean
}

interface TypedDecodeArgs<
  T extends ABISerializableType
> extends DecodeArgsBase {
  type: T
}

interface BuiltinDecodeArgs<
  T extends keyof BuiltinTypes
> extends DecodeArgsBase {
  type: T
}

interface UntypedDecodeArgs extends DecodeArgsBase {
  type: ABISerializableType
}

class DecodingError extends Error {
  static __className = "DecodingError"
  ctx: DecodingContext
  underlyingError: Error
  constructor(ctx: DecodingContext, underlyingError: Error) {
    const path = ctx.codingPath
      .map(({ field, type }) => {
        if (typeof field === "number") {
          return field
        } else {
          return `${field}<${type.typeName}>`
        }
      })
      .join(".")
    super(`Decoding error at ${path}: ${underlyingError.message}`)
    this.stack = underlyingError.stack
    this.ctx = ctx
    this.underlyingError = underlyingError
  }
}

export function abiDecode<T extends keyof BuiltinTypes>(
  args: BuiltinDecodeArgs<T>
): BuiltinTypes[T]
export function abiDecode<T extends ABISerializableConstructor>(
  args: TypedDecodeArgs<T>
): InstanceType<T>
export function abiDecode(args: UntypedDecodeArgs): ABISerializable

export function abiDecode(
  args: UntypedDecodeArgs | BuiltinDecodeArgs<any> | TypedDecodeArgs<any>
) {
  const descriptor = toTypeDescriptor(args.type)
  const typeName = abiTypeString(descriptor)
  const customTypes = args.customTypes || []
  let abi: ABI

  if (args.abi) {
    abi = ABI.from(args.abi)
  } else {
    try {
      let type: ABISerializableConstructor

      if (typeof descriptor.type === "string") {
        const lookup = buildTypeLookup(customTypes)
        const rName = new ABI.ResolvedType(descriptor.type).name // type name w/o suffixes
        type = lookup[rName] as ABISerializableConstructor

        if (!type) {
          throw new Error(`Unknown type: ${descriptor.type}`)
        }
      } else {
        type = descriptor.type
      }

      const synthesized = synthesizeABI(type)
      abi = synthesized.abi
      customTypes.push(...synthesized.types)
    } catch (error: any) {
      throw Error(
        `Unable to synthesize ABI for: ${typeName} (${error.message}). ` +
          "To decode non-class types you need to pass the ABI definition manually."
      )
    }
  }

  const resolved = abi.resolveType(typeName)

  if (typeof descriptor.type !== "string") {
    customTypes.unshift(descriptor.type)
  }

  const ctx: DecodingContext = {
    types: buildTypeLookup(customTypes),
    strictExtensions: args.strictExtensions || false,
    codingPath: [{ field: "root", type: resolved }]
  }

  try {
    if (args.data || args.data === "") {
      let decoder: ABIDecoder

      if (isInstanceOf(args.data, ABIDecoder)) {
        decoder = args.data
      } else {
        const bytes = Bytes.from(args.data)
        const fatal =
          args.ignoreInvalidUTF8 === undefined ? true : !args.ignoreInvalidUTF8
        decoder = new ABIDecoder(
          bytes.array,
          new TextDecoder("utf-8", { fatal })
        )
      }

      if (args.metadata) {
        decoder.metadata = args.metadata
      }

      return decodeBinary(resolved, decoder, ctx)
    } else if (args.object !== undefined) {
      return decodeObject(args.object, resolved, ctx)
    } else if (args.json) {
      return decodeObject(JSON.parse(args.json), resolved, ctx)
    } else {
      throw new Error(
        "Nothing to decode, you must set one of data, json, object"
      )
    }
  } catch (error: any) {
    throw new DecodingError(ctx, error)
  }
}

interface DecodingContext {
  types: TypeLookup
  strictExtensions: boolean
  codingPath: { field: string | number; type: ABI.ResolvedType }[]
}

/** Marker for objects when they have been resolved, i.e. their types `from` factory method will not need to resolve children. */
export const Resolved = Symbol("Resolved")

function decodeBinary(
  type: ABI.ResolvedType,
  decoder: ABIDecoder,
  ctx: DecodingContext
): any {
  if (ctx.codingPath.length > 32) {
    throw new Error("Maximum decoding depth exceeded")
  }

  if (type.isExtension) {
    if (!decoder.canRead()) {
      if (ctx.strictExtensions) {
        return defaultValue(type, ctx)
      } else {
        return null
      }
    }
  }

  if (type.isOptional) {
    if (decoder.readByte() === 0) {
      return null
    }
  }

  if (type.isArray) {
    const len = decoder.readVaruint32()
    const rv: any[] = []

    for (let i = 0; i < len; i++) {
      ctx.codingPath.push({ field: i, type })
      rv.push(decodeInner())
      ctx.codingPath.pop()
    }

    return rv
  } else {
    return decodeInner()
  }

  function decodeInner() {
    const abiType = ctx.types[type.name]

    if (abiType && abiType.fromABI) {
      return abiType.fromABI(decoder)
    } else {
      if (type.ref) {
        // follow type alias
        ctx.codingPath.push({ field: "", type: type.ref })
        const rv = decodeBinary(type.ref, decoder, ctx)
        ctx.codingPath.pop()
        return rv
      } else if (type.fields) {
        const fields = type.allFields

        if (!fields) {
          throw new Error("Invalid struct fields")
        }

        const rv: any = {}

        for (const field of fields) {
          ctx.codingPath.push({ field: field.name, type: field.type })
          rv[field.name] = decodeBinary(field.type, decoder, ctx)
          ctx.codingPath.pop()
        }

        if (abiType) {
          rv[Resolved] = true
          return abiType.from(rv)
        } else {
          return rv
        }
      } else if (type.enum) {
        // Enum type: decode as underlying integer type, then resolve to member name
        const enumInfo = type.enum
        const innerType = new ABI.ResolvedType(enumInfo.type)
        const intValue = decodeBinary(innerType, decoder, ctx)
        const numVal =
          typeof intValue === "number" ? intValue : Number(intValue)
        const ev = enumInfo.values.find(v => v.value === numVal)
        return ev ? ev.name : intValue
      } else if (type.variant) {
        const vIdx = decoder.readByte()
        const vType = type.variant[vIdx]

        if (!vType) {
          throw new Error(`Unknown variant idx: ${vIdx}`)
        }

        ctx.codingPath.push({ field: `v${vIdx}`, type: vType })
        const rv = [vType.typeName, decodeBinary(vType, decoder, ctx)]
        ctx.codingPath.pop()

        if (abiType) {
          return abiType.from(rv)
        } else {
          return rv
        }
      } else if (abiType) {
        throw new Error("Invalid type")
      } else {
        throw new Error(
          type.name === "any"
            ? "Unable to decode 'any' type from binary"
            : "Unknown type"
        )
      }
    }
  }
}

function decodeObject(
  value: any,
  type: ABI.ResolvedType,
  ctx: DecodingContext
): any {
  if (value === null || value === undefined) {
    if (type.isOptional) {
      return null
    }

    if (type.isExtension) {
      if (ctx.strictExtensions) {
        return defaultValue(type, ctx)
      } else {
        return null
      }
    }

    throw new Error(
      `Unexpectedly encountered ${value} for non-optional (${ctx.codingPath
        .map(path => path.field)
        .join(".")})`
    )
  } else if (type.isArray) {
    if (!Array.isArray(value)) {
      throw new Error("Expected array")
    }

    const rv: any[] = []
    const len = value.length

    for (let i = 0; i < len; i++) {
      ctx.codingPath.push({ field: i, type })
      rv.push(decodeInner(value[i]))
      ctx.codingPath.pop()
    }

    return rv
  } else {
    return decodeInner(value)
  }

  function decodeInner(value: any) {
    const abiType = ctx.types[type.name]

    if (type.ref && !abiType) {
      // follow type alias
      return decodeObject(value, type.ref, ctx)
    } else if (type.fields) {
      if (typeof value !== "object") {
        throw new Error("Expected object")
      }

      if (typeof abiType === "function" && isInstanceOf(value, abiType)) {
        return value
      }

      const fields = type.allFields

      if (!fields) {
        throw new Error("Invalid struct fields")
      }

      const struct: any = {}

      for (const field of fields) {
        ctx.codingPath.push({ field: field.name, type: field.type })
        struct[field.name] = decodeObject(value[field.name], field.type, ctx)
        ctx.codingPath.pop()
      }

      if (abiType) {
        struct[Resolved] = true
        return abiType.from(struct)
      } else {
        return struct
      }
    } else if (type.enum) {
      // Enum type: accept string name or integer value
      const enumInfo = type.enum

      if (typeof value === "string") {
        const ev = enumInfo.values.find(v => v.name === value)

        if (ev === undefined) {
          throw new Error(`Unknown enum value: ${value}`)
        }

        return value // return the string name as-is
      }

      // numeric value - resolve to name if possible
      const numVal = typeof value === "number" ? value : Number(value)
      const ev = enumInfo.values.find(v => v.value === numVal)
      return ev ? ev.name : numVal
    } else if (type.variant) {
      let vName: string | undefined

      if (
        Array.isArray(value) &&
        value.length === 2 &&
        typeof value[0] === "string"
      ) {
        vName = value[0]
        value = value[1]
      } else if (isInstanceOf(value, Variant)) {
        vName = value.variantName
        value = value.value
      } else {
        vName = getTypeName(value)
      }

      const vIdx = type.variant.findIndex(t => t.typeName === vName)

      if (vIdx === -1) {
        throw new Error(`Unknown variant type: ${vName}`)
      }

      const vType = type.variant[vIdx]
      ctx.codingPath.push({ field: `v${vIdx}`, type: vType })
      const rv = [vType.typeName, decodeObject(value, vType, ctx)]
      ctx.codingPath.pop()

      if (abiType) {
        rv[Resolved] = true
        return abiType.from(rv)
      } else {
        return rv
      }
    } else {
      if (!abiType) {
        // special case for `any` when decoding from object
        if (type.name === "any") {
          return value
        }

        throw new Error("Unknown type")
      }

      return abiType.from(value)
    }
  }
}

/** Return default value (aka initialized value, matching C++ where possible) for given type */
function defaultValue(
  type: ABI.ResolvedType,
  ctx: DecodingContext,
  seen: Set<string> = new Set()
): any {
  if (type.isArray) {
    return []
  }

  if (type.isOptional) {
    return null
  }

  const abiType = ctx.types[type.name]

  if (abiType && abiType.abiDefault) {
    return abiType.abiDefault()
  }

  if (seen.has(type.name)) {
    throw new Error("Circular type reference")
  }

  seen.add(type.name)

  if (type.allFields) {
    const rv: any = {}

    for (const field of type.allFields) {
      ctx.codingPath.push({ field: field.name, type: field.type })
      rv[field.name] = defaultValue(field.type, ctx, seen)
      ctx.codingPath.pop()
    }

    if (abiType) {
      rv[Resolved] = true
      return abiType.from(rv)
    }

    return rv
  }

  if (type.enum) {
    // Default to first enum value
    if (type.enum.values.length > 0) {
      return type.enum.values[0].name
    }

    return 0
  }

  if (type.variant && type.variant.length > 0) {
    const rv = [type.variant[0].typeName, defaultValue(type.variant[0], ctx)]

    if (abiType) {
      rv[Resolved] = true
      return abiType.from(rv)
    }

    return rv
  }

  if (type.ref) {
    ctx.codingPath.push({ field: "", type: type.ref })
    const rv = defaultValue(type.ref, ctx, seen)
    ctx.codingPath.pop()
    return rv
  }

  throw new Error("Unable to determine default value")
}

export class ABIDecoder {
  static __className = "ABIDecoder"

  private pos = 0
  private data: DataView
  private textDecoder: TextDecoder

  /** User declared metadata, can be used to pass info to instances when decoding.  */
  metadata: Record<string, any> = {}

  constructor(
    private array: Uint8Array,
    textDecoder?: TextDecoder
  ) {
    this.textDecoder = textDecoder || new TextDecoder("utf-8", { fatal: true })
    this.data = new DataView(array.buffer, array.byteOffset, array.byteLength)
  }

  canRead(bytes = 1): boolean {
    return !(this.pos + bytes > this.array.byteLength)
  }

  private ensure(bytes: number) {
    if (!this.canRead(bytes)) {
      throw new Error("Read past end of buffer")
    }
  }

  setPosition(pos: number) {
    if (pos < 0 || pos > this.array.byteLength) {
      throw new Error("Invalid position")
    }

    this.pos = pos
  }

  getPosition(): number {
    return this.pos
  }

  advance(bytes: number) {
    this.ensure(bytes)
    this.pos += bytes
  }

  /** Read one byte. */
  readByte(): number {
    this.ensure(1)
    return this.array[this.pos++]
  }

  /** Read floating point as JavaScript number, 32 or 64 bits. */
  readFloat(byteWidth: number) {
    this.ensure(byteWidth)
    let rv: number

    switch (byteWidth) {
      case 4:
        rv = this.data.getFloat32(this.pos, true)
        break
      case 8:
        rv = this.data.getFloat64(this.pos, true)
        break
      default:
        throw new Error("Invalid float size")
    }

    this.pos += byteWidth
    return rv
  }

  readVaruint32() {
    let v = 0
    let bit = 0

    for (;;) {
      const b = this.readByte()
      v |= (b & 0x7f) << bit
      bit += 7

      if (!(b & 0x80)) {
        break
      }
    }

    return v >>> 0
  }

  readVarint32() {
    const v = this.readVaruint32()

    if (v & 1) {
      return (~v >> 1) | 0x8000_0000
    } else {
      return v >>> 1
    }
  }

  readArray(length: number) {
    this.ensure(length)
    const rv = this.array.subarray(this.pos, this.pos + length)
    this.pos += length
    return rv
  }

  readString() {
    const length = this.readVaruint32()
    return this.textDecoder.decode(this.readArray(length))
  }
}
