import { isInstanceOf } from "../Utils.js"
import type { ABISerializableObject } from "../serializer/Serializable.js"
import { abiDecode, ABIDecoder } from "../serializer/Decoder.js"
import { abiEncode, ABIEncoder } from "../serializer/Encoder.js"

import { Blob } from "./Blob.js"
import { Name, NameType } from "./Name.js"

export type ABIDef = string | Partial<ABI.Def> | ABI | Blob

export class ABI implements ABISerializableObject {
  static abiName = "abi"
  static version = "sysio::abi/1.1"

  version: string
  /// List of type aliases.
  types: ABI.TypeDef[]
  /// List of variant types.
  variants: ABI.Variant[]
  /// List of struct types.
  structs: ABI.Struct[]
  /// List of contract actions.
  actions: ABI.Action[]
  /// List of contract tables.
  tables: ABI.Table[]
  /// Ricardian contracts.
  ricardian_clauses: ABI.Clause[]
  /// Action Results
  action_results: ABI.ActionResult[]
  /// List of enum types.
  enums: ABI.Enum[]

  constructor(args: Partial<ABI.Def>) {
    this.version = args.version || ABI.version
    this.types = args.types || []
    this.variants = args.variants || []
    this.structs = args.structs || []
    this.actions = args.actions || []
    this.tables = args.tables || []
    this.ricardian_clauses = args.ricardian_clauses || []
    this.action_results = args.action_results || []
    this.enums = args.enums || []
  }

  static from(value: ABIDef) {
    if (isInstanceOf(value, ABI)) {
      return value
    }

    if (isInstanceOf(value, Blob)) {
      return abiDecode({
        data: value.array,
        type: this
      })
    }

    if (typeof value === "string") {
      return new ABI(JSON.parse(value))
    }

    return new ABI(value)
  }

  static fromABI(decoder: ABIDecoder) {
    const version = decoder.readString()
    const types: ABI.TypeDef[] = []
    const numTypes = decoder.readVaruint32()

    for (let i = 0; i < numTypes; i++) {
      types.push({
        new_type_name: decoder.readString(),
        type: decoder.readString()
      })
    }

    const structs: ABI.Struct[] = []
    const numStructs = decoder.readVaruint32()

    for (let i = 0; i < numStructs; i++) {
      const name = decoder.readString()
      const base = decoder.readString()
      const numFields = decoder.readVaruint32()
      const fields: ABI.Field[] = []

      for (let j = 0; j < numFields; j++) {
        fields.push({ name: decoder.readString(), type: decoder.readString() })
      }

      structs.push({ base, name, fields })
    }

    const actions: ABI.Action[] = []
    const numActions = decoder.readVaruint32()

    for (let i = 0; i < numActions; i++) {
      const name = Name.fromABI(decoder)
      const type = decoder.readString()
      const ricardian_contract = decoder.readString()
      actions.push({ name, type, ricardian_contract })
    }

    const tables: ABI.Table[] = []
    const numTables = decoder.readVaruint32()

    for (let i = 0; i < numTables; i++) {
      // name is a length-prefixed string (widened from sysio::name uint64);
      // table_id (uint16) and secondary_indexes (vector<index_def>) follow.
      // Binary order matches sysio::chain::table_def.
      const name = decoder.readString()
      const index_type = decoder.readString()
      const key_names: string[] = []
      const numKeyNames = decoder.readVaruint32()

      for (let j = 0; j < numKeyNames; j++) {
        key_names.push(decoder.readString())
      }

      const key_types: string[] = []
      const numKeyTypes = decoder.readVaruint32()

      for (let j = 0; j < numKeyTypes; j++) {
        key_types.push(decoder.readString())
      }

      const type = decoder.readString()
      const table_id = ABI.readUint16LE(decoder)
      const secondary_indexes: ABI.Index[] = []
      const numIndexes = decoder.readVaruint32()

      for (let j = 0; j < numIndexes; j++) {
        const idxName = decoder.readString()
        const idxKeyType = decoder.readString()
        secondary_indexes.push({
          name: idxName,
          key_type: idxKeyType,
          table_id: ABI.readUint16LE(decoder)
        })
      }

      tables.push({
        name,
        index_type,
        key_names,
        key_types,
        type,
        table_id,
        secondary_indexes
      })
    }

    const ricardian_clauses: ABI.Clause[] = []
    const numClauses = decoder.readVaruint32()

    for (let i = 0; i < numClauses; i++) {
      const id = decoder.readString()
      const body = decoder.readString()
      ricardian_clauses.push({ id, body })
    }

    // error_messages, never used?
    const numErrors = decoder.readVaruint32()

    for (let i = 0; i < numErrors; i++) {
      decoder.advance(8) // uint64 error_code
      decoder.advance(decoder.readVaruint32()) // string error_msgr
    }

    // extensions, not used
    const numExtensions = decoder.readVaruint32()

    for (let i = 0; i < numExtensions; i++) {
      decoder.advance(2) // uint16 type
      decoder.advance(decoder.readVaruint32()) // bytes data
    }

    // variants is a binary extension for some reason even though extensions are defined on the type
    const variants: ABI.Variant[] = []

    if (decoder.canRead()) {
      const numVariants = decoder.readVaruint32()

      for (let i = 0; i < numVariants; i++) {
        const name = decoder.readString()
        const types: string[] = []
        const numTypes = decoder.readVaruint32()

        for (let j = 0; j < numTypes; j++) {
          types.push(decoder.readString())
        }

        variants.push({ name, types })
      }
    }

    const action_results: ABI.ActionResult[] = []

    if (decoder.canRead()) {
      const numActionResults = decoder.readVaruint32()

      for (let i = 0; i < numActionResults; i++) {
        const name = Name.fromABI(decoder)
        const result_type = decoder.readString()
        action_results.push({ name, result_type })
      }
    }

    const enums: ABI.Enum[] = []

    if (decoder.canRead()) {
      const numEnums = decoder.readVaruint32()

      for (let i = 0; i < numEnums; i++) {
        const name = decoder.readString()
        const type = decoder.readString()
        const values: ABI.EnumValue[] = []
        const numValues = decoder.readVaruint32()

        for (let j = 0; j < numValues; j++) {
          const vname = decoder.readString()
          // int64 value - read as two uint32s (little-endian), reconstruct as signed
          const lo = decoder.readArray(4)
          const hi = decoder.readArray(4)
          const loVal =
            lo[0] | (lo[1] << 8) | (lo[2] << 16) | ((lo[3] << 24) >>> 0)
          const hiVal =
            hi[0] | (hi[1] << 8) | (hi[2] << 16) | ((hi[3] << 24) >>> 0)
          // Reconstruct as signed: if high bit set, value is negative
          let value: number
          if (hiVal >= 0x80000000) {
            // Negative: compute -(2^64 - raw)
            value = -(0x100000000 * (0x100000000 - hiVal) - loVal)
          } else {
            value = hiVal * 0x100000000 + loVal
          }
          values.push({ name: vname, value })
        }

        enums.push({ name, type, values })
      }
    }

    // After enums, wire-sysio sysio::abi/1.x writes protobuf_types as the
    // sole trailing extension (length-prefixed string). We drain any
    // further string-typed trailers for forward-compat within the 1.x
    // line, but only when `version` is a recognized 1.x tag — if a
    // future release bumps the major or introduces a non-string trailing
    // extension, a blind drain would mis-parse the length prefix as a
    // string length and silently produce a corrupt ABI. Scoping the
    // drain to known-safe versions makes that failure mode explicit:
    // unrecognized versions stop here with any trailing bytes ignored,
    // and extending this parser is required when the wire format grows
    // a new non-string field. The SDK does not consume the string
    // trailers; they are read purely to advance past them.
    const knownStringOnlyTrailers = version.startsWith("sysio::abi/1.")
    if (knownStringOnlyTrailers) {
      while (decoder.canRead()) {
        decoder.readString()
      }
    }

    return new ABI({
      version,
      types,
      structs,
      actions,
      tables,
      ricardian_clauses,
      variants,
      action_results,
      enums
    })
  }

  toABI(encoder: ABIEncoder) {
    encoder.writeString(this.version)
    encoder.writeVaruint32(this.types.length)

    for (const type of this.types) {
      encoder.writeString(type.new_type_name)
      encoder.writeString(type.type)
    }

    encoder.writeVaruint32(this.structs.length)

    for (const struct of this.structs) {
      encoder.writeString(struct.name)
      encoder.writeString(struct.base)
      encoder.writeVaruint32(struct.fields.length)

      for (const field of struct.fields) {
        encoder.writeString(field.name)
        encoder.writeString(field.type)
      }
    }

    encoder.writeVaruint32(this.actions.length)

    for (const action of this.actions) {
      Name.from(action.name).toABI(encoder)
      encoder.writeString(action.type)
      encoder.writeString(action.ricardian_contract)
    }

    encoder.writeVaruint32(this.tables.length)

    for (const table of this.tables) {
      // Binary order matches sysio::chain::table_def: name (string),
      // index_type, key_names, key_types, type, table_id (uint16 LE),
      // secondary_indexes (vector<index_def>). Mirror of the layout
      // consumed in fromABI — keep both sides in sync.
      encoder.writeString(table.name)
      encoder.writeString(table.index_type)
      encoder.writeVaruint32(table.key_names.length)

      for (const key of table.key_names) {
        encoder.writeString(key)
      }

      encoder.writeVaruint32(table.key_types.length)

      for (const key of table.key_types) {
        encoder.writeString(key)
      }

      encoder.writeString(table.type)
      // table_id defaults to 0 for hand-built tables that omit it;
      // on-chain ABIs always carry a DJB2(name) % 65536 value.
      ABI.writeUint16LE(
        encoder,
        table.table_id ?? 0,
        `table ${table.name} table_id`
      )
      const secIdx = table.secondary_indexes ?? []
      encoder.writeVaruint32(secIdx.length)

      for (const idx of secIdx) {
        encoder.writeString(idx.name)
        encoder.writeString(idx.key_type)
        ABI.writeUint16LE(
          encoder,
          idx.table_id ?? 0,
          `index ${idx.name} table_id`
        )
      }
    }

    encoder.writeVaruint32(this.ricardian_clauses.length)

    for (const clause of this.ricardian_clauses) {
      encoder.writeString(clause.id)
      encoder.writeString(clause.body)
    }

    encoder.writeVaruint32(0) // error_messages
    encoder.writeVaruint32(0) // extensions
    encoder.writeVaruint32(this.variants.length)

    for (const variant of this.variants) {
      encoder.writeString(variant.name)
      encoder.writeVaruint32(variant.types.length)

      for (const type of variant.types) {
        encoder.writeString(type)
      }
    }

    encoder.writeVaruint32(this.action_results.length)

    for (const result of this.action_results) {
      Name.from(result.name).toABI(encoder)
      encoder.writeString(result.result_type)
    }

    encoder.writeVaruint32(this.enums.length)

    for (const enumDef of this.enums) {
      encoder.writeString(enumDef.name)
      encoder.writeString(enumDef.type)
      encoder.writeVaruint32(enumDef.values.length)

      for (const ev of enumDef.values) {
        encoder.writeString(ev.name)
        // int64 value as two uint32 little-endian
        const raw = ev.value < 0 ? ev.value + 0x10000000000000000 : ev.value
        const lo = raw >>> 0
        const hi = (raw / 0x100000000) >>> 0
        const buf = new Uint8Array(8)
        buf[0] = lo & 0xff
        buf[1] = (lo >> 8) & 0xff
        buf[2] = (lo >> 16) & 0xff
        buf[3] = (lo >> 24) & 0xff
        buf[4] = hi & 0xff
        buf[5] = (hi >> 8) & 0xff
        buf[6] = (hi >> 16) & 0xff
        buf[7] = (hi >> 24) & 0xff
        encoder.writeArray(buf)
      }
    }

    // protobuf_types trailer: only emitted for sysio::abi/1.x, matching
    // the decoder's version gate in fromABI. For non-1.x versions (e.g.
    // a future sysio::abi/2.0 whose trailer shape is unknown here), no
    // trailer is written so round-tripping through this SDK stays
    // byte-exact for whatever version the ABI claims.
    if (this.version.startsWith("sysio::abi/1.")) {
      encoder.writeString("")
    }
  }

  private static assertUint16(value: number, label: string) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
      throw new Error(
        `ABI ${label} must be a uint16 in [0, 65535], got ${value}`
      )
    }
  }

  private static readUint16LE(decoder: ABIDecoder): number {
    const lo = decoder.readByte()
    const hi = decoder.readByte()
    return lo | (hi << 8)
  }

  private static writeUint16LE(
    encoder: ABIEncoder,
    value: number,
    label: string
  ) {
    ABI.assertUint16(value, label)
    encoder.writeByte(value & 0xff)
    encoder.writeByte((value >> 8) & 0xff)
  }

  resolveType(name: string): ABI.ResolvedType {
    const types: { [name: string]: ABI.ResolvedType } = {}
    return this.resolve({ name, types }, { id: 0 })
  }

  resolveAll() {
    const types: { [name: string]: ABI.ResolvedType } = {}
    const ctx: { id: number } = { id: 0 }
    return {
      types: this.types.map(t =>
        this.resolve({ name: t.new_type_name, types }, ctx)
      ),
      variants: this.variants.map(t =>
        this.resolve({ name: t.name, types }, ctx)
      ),
      structs: this.structs.map(t =>
        this.resolve({ name: t.name, types }, ctx)
      ),
      enums: this.enums.map(t => this.resolve({ name: t.name, types }, ctx))
    }
  }

  private resolve(
    {
      name,
      types
    }: { name: string; types: { [name: string]: ABI.ResolvedType } },
    ctx: { id: number }
  ): ABI.ResolvedType {
    const existing = types[name]

    if (existing) {
      return existing
    }

    const type = new ABI.ResolvedType(name, ++ctx.id)
    types[type.typeName] = type
    const alias = this.types.find(typeDef => typeDef.new_type_name == type.name)

    if (alias) {
      type.ref = this.resolve({ name: alias.type, types }, ctx)
      return type
    }

    const struct = this.getStruct(type.name)

    if (struct) {
      if (struct.base) {
        type.base = this.resolve({ name: struct.base, types }, ctx)
      }

      type.fields = struct.fields.map(field => {
        return {
          name: field.name,
          type: this.resolve({ name: field.type, types }, ctx)
        }
      })
      return type
    }

    const variant = this.getVariant(type.name)

    if (variant) {
      type.variant = variant.types.map(name =>
        this.resolve({ name, types }, ctx)
      )
      return type
    }

    const enumDef = this.getEnum(type.name)

    if (enumDef) {
      type.enum = {
        type: enumDef.type,
        values: enumDef.values
      }
      return type
    }

    // builtin or unknown type
    return type
  }

  getStruct(name: string): ABI.Struct | undefined {
    return this.structs.find(struct => struct.name == name)
  }

  getVariant(name: string): ABI.Variant | undefined {
    return this.variants.find(variant => variant.name == name)
  }

  getEnum(name: string): ABI.Enum | undefined {
    return this.enums.find(e => e.name == name)
  }

  /** Return arguments type of an action in this ABI. */
  getActionType(actionName: NameType): string | undefined {
    const name = Name.from(actionName).toString()
    const action = this.actions.find(a => a.name.toString() === name)

    if (action) {
      return action.type
    }
  }

  equals(other: ABIDef): boolean {
    const o = ABI.from(other)

    if (
      this.version != o.version ||
      this.types.length != o.types.length ||
      this.structs.length != o.structs.length ||
      this.actions.length != o.actions.length ||
      this.tables.length != o.tables.length ||
      this.ricardian_clauses.length != o.ricardian_clauses.length ||
      this.variants.length != o.variants.length ||
      this.action_results.length != o.action_results.length ||
      this.enums.length != o.enums.length
    ) {
      return false
    }

    return abiEncode({ object: this }).equals(abiEncode({ object: o }))
  }

  toJSON() {
    return {
      version: this.version,
      types: this.types,
      structs: this.structs,
      actions: this.actions,
      tables: this.tables,
      ricardian_clauses: this.ricardian_clauses,
      error_messages: [],
      abi_extensions: [],
      variants: this.variants,
      action_results: this.action_results,
      enums: this.enums
    }
  }
}

export namespace ABI {
  export interface TypeDef {
    new_type_name: string
    type: string
  }
  export interface Field {
    name: string
    type: string
  }
  export interface Struct {
    name: string
    base: string
    fields: Field[]
  }
  export interface Action {
    name: NameType
    type: string
    ricardian_contract: string
  }
  // Per-secondary-index metadata embedded in Table. Mirrors
  // sysio::chain::index_def. table_id is a uint16 DJB2(name) % 65536.
  // On-chain ABIs always carry a non-zero table_id (CDT computes it at
  // compile time); the field is optional here to allow programmatic
  // construction of ABI objects, in which case the encoder writes 0.
  export interface Index {
    name: string
    key_type: string
    /** uint16 DJB2(name) % 65536; always present in on-chain ABIs,
     *  defaults to 0 on encode when omitted from a hand-built ABI. */
    table_id?: number
  }
  // table_def.name is a free-form string (was sysio::name uint64 pre-wire),
  // so names > 12 chars / containing arbitrary characters are valid.
  // table_id (uint16) = DJB2(name) % 65536 and secondary_indexes provide
  // per-table namespace isolation for KV-backed tables. This SDK only
  // supports the wire-sysio binary format.
  export interface Table {
    name: string
    index_type: string
    key_names: string[]
    key_types: string[]
    type: string
    table_id?: number
    secondary_indexes?: Index[]
  }
  export interface Clause {
    id: string
    body: string
  }
  export interface Variant {
    name: string
    types: string[]
  }
  export interface Def {
    version: string
    types: TypeDef[]
    variants: Variant[]
    structs: Struct[]
    actions: Action[]
    tables: Table[]
    ricardian_clauses: Clause[]
    action_results: ActionResult[]
    enums: Enum[]
  }
  export interface ActionResult {
    name: NameType
    result_type: string
  }
  export interface EnumValue {
    name: string
    value: number
  }
  export interface Enum {
    name: string
    type: string // underlying type, e.g. "uint8"
    values: EnumValue[]
  }
  export class ResolvedType {
    name: string
    id: number
    isArray: boolean
    isOptional: boolean
    isExtension: boolean

    base?: ResolvedType
    fields?: { name: string; type: ResolvedType }[]
    variant?: ResolvedType[]
    ref?: ResolvedType
    enum?: { type: string; values: EnumValue[] }

    constructor(fullName: string, id = 0) {
      let name = fullName

      if (name.endsWith("$")) {
        name = name.slice(0, -1)
        this.isExtension = true
      } else {
        this.isExtension = false
      }

      if (name.endsWith("?")) {
        name = name.slice(0, -1)
        this.isOptional = true
      } else {
        this.isOptional = false
      }

      if (name.endsWith("[]")) {
        name = name.slice(0, -2)
        this.isArray = true
      } else {
        this.isArray = false
      }

      this.id = id
      this.name = name
    }

    /**
     * Type name including suffixes: [] array, ? optional, $ binary ext
     */
    get typeName(): string {
      let rv = this.name

      if (this.isArray) {
        rv += "[]"
      }

      if (this.isOptional) {
        rv += "?"
      }

      if (this.isExtension) {
        rv += "$"
      }

      return rv
    }

    /** All fields including base struct(s), undefined if not a struct type. */
    get allFields() {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      let current: ResolvedType | undefined = this
      const rv: { name: string; type: ResolvedType }[] = []
      const seen = new Set<string>()

      do {
        if (!current.fields) {
          return // invalid struct
        }

        if (seen.has(current.name)) {
          return // circular ref
        }

        for (let i = current.fields.length - 1; i >= 0; i--) {
          rv.unshift(current.fields[i])
        }

        seen.add(current.name)
        current = current.base
      } while (current !== undefined)

      return rv
    }
  }
}
