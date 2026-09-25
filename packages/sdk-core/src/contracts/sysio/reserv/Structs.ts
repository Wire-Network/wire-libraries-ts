import { ABIDecoder } from "../../../serializer/Decoder.js"
import { ABIEncoder } from "../../../serializer/Encoder.js"
import { ABISerializableObject } from "../../../serializer/Serializable.js"
import { UInt64 } from "../../../chain/Integer.js"
import { Name } from "../../../chain/Name.js"
import { Struct } from "../../../chain/Struct.js"
import { SlugName } from "../../../SlugName.js"
import { isInstanceOf } from "../../../Utils.js"

/**
 * Runtime serializer for the Wire `slug_name` chain type used by `sysio.reserv`.
 *
 * Modelled on `Name`, not on `Struct`: `slug_name` is an ABI BUILTIN on the
 * chain, so it has one wire form (a packed `uint64` — unchanged, the bytes are
 * what the depot stores) and one JSON form (the canonical spelling, the only
 * carrier the builtin emits or accepts). A `Struct` subclass cannot express
 * that — the object decoder dispatches on `type.fields` before consulting a
 * class's own `from`, so a struct-shaped slug can only ever be written as
 * `{ value }`.
 */
export class ReservSlugName implements ABISerializableObject {
  static abiName = "slug_name"

  /** Packed eight-symbol code — the wire form. */
  value: UInt64

  /** Builds from the canonical spelling, an already-packed value, or itself. */
  static from(value: ReservSlugName | UInt64 | string | number): ReservSlugName {
    if (isInstanceOf(value, ReservSlugName)) return value
    if (isInstanceOf(value, UInt64)) return new ReservSlugName(value)

    return new ReservSlugName(
      UInt64.from(typeof value === "string" ? SlugName.from(value) : value)
    )
  }

  static fromABI(decoder: ABIDecoder) {
    return new ReservSlugName(UInt64.fromABI(decoder))
  }

  static abiDefault() {
    return new this(UInt64.from(0))
  }

  constructor(value: UInt64) {
    this.value = value
  }

  /** Return true if this slug is equal to the passed slug. */
  equals(other: ReservSlugName | UInt64 | string | number): boolean {
    return this.value.equals(ReservSlugName.from(other).value)
  }

  /** The canonical spelling — `""` for the zero sentinel. */
  toString(): string {
    return SlugName.toString(this.value.toNumber())
  }

  toABI(encoder: ABIEncoder) {
    this.value.toABI(encoder)
  }

  /** @internal */
  toJSON() {
    return this.toString()
  }
}

/** Runtime serializer for `sysio.reserv::matchreserve`. */
@Struct.type("matchreserve")
export class ReservMatchReserve extends Struct {
  /** Source outpost chain code. */
  @Struct.field(ReservSlugName) declare chain_code: ReservSlugName

  /** Source asset token code. */
  @Struct.field(ReservSlugName) declare token_code: ReservSlugName

  /** Reserve discriminator code. */
  @Struct.field(ReservSlugName) declare reserve_code: ReservSlugName

  /** AuthEx-linked Wire account funding the WIRE side. */
  @Struct.field("name") declare matcher: Name

  /** Exact WIRE base-unit amount requested by the pending reserve. */
  @Struct.field("uint64") declare wire_amount: UInt64
}

/** Runtime serializer for read-only `sysio.reserv::swapquote`. */
@Struct.type("swapquote")
export class ReservSwapQuote extends Struct {
  /** Source chain code. */
  @Struct.field(ReservSlugName) declare from_chain_code: ReservSlugName

  /** Source token code. */
  @Struct.field(ReservSlugName) declare from_token_code: ReservSlugName

  /** Source reserve code. */
  @Struct.field(ReservSlugName) declare from_reserve_code: ReservSlugName

  /** Source amount in source-token base units. */
  @Struct.field("uint64") declare from_amount: UInt64

  /** Destination chain code. */
  @Struct.field(ReservSlugName) declare to_chain_code: ReservSlugName

  /** Destination token code. */
  @Struct.field(ReservSlugName) declare to_token_code: ReservSlugName

  /** Destination reserve code. */
  @Struct.field(ReservSlugName) declare to_reserve_code: ReservSlugName
}
