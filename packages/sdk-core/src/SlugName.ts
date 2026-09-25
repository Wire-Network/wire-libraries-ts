import { Either } from "@3fv/prelude-ts"
import { match, P } from "ts-pattern"

import { NestedError } from "@wireio/shared"

import { UInt64 } from "./chain/Integer.js"

/** Every character a slug_name may contain — `slug_name_traits::alphabet`. */
const SlugAlphabetPattern = /^[A-Z0-9_]+$/

/**
 * The characters a slug_name may START with —
 * `slug_name_traits::leading_alphabet`.
 */
const SlugLeadingAlphabetPattern = /^[A-Z]/

/**
 * SlugName — TypeScript counterpart to the `sysio::slug_name` (contract) /
 * `fc::slug_name` (host) packed 8-byte type used as the primary key for
 * Chain / Token / ChainToken / Reserve identifiers in the post-v6 data model.
 *
 * Wire format: uint64. JS-safe — six bits per character, max eight characters,
 * giving 48 bits worth of slot occupancy. That sits comfortably under
 * `Number.MAX_SAFE_INTEGER` (2^53), so JS `number` is the natural carrier
 * here; no `bigint` required at the API boundary.
 *
 * Alphabet: `[A-Z0-9_]+` — slot 0 is the implicit terminator, slots 1..26 hold
 * `A..Z`, slots 27..36 hold `0..9`, slot 37 holds `_`. Characters outside the
 * alphabet are a parse error. Inputs longer than 8 chars are a parse error.
 *
 * A code must START with a letter. That is what makes the chain's string
 * carrier unambiguous — no legal code can be spelled like a number, so a bare
 * JSON string is always a code and never a decimal. Digits and `_` stay legal
 * in every position after the first (`V1`, `USDC`, `TRAIL_`).
 *
 * Mirrors the encoding in `wire-sysio/contracts/sysio.opp.common/include/sysio.opp.common/slug_name.hpp`,
 * and the leading rule in `fc::slug_name_traits::leading_alphabet` (host) /
 * `sysio::slug_name_traits::leading_alphabet` (CDT).
 */
export class SlugName {
  /**
   * Parse a slug_name string to its packed `uint64` (JS `number`) value.
   *
   * Encoding uses arithmetic (`+` / `*`) rather than bitwise ops because
   * JS `<<` / `|` truncate to 32-bit signed integers. An 8-character
   * slug_name occupies 48 bits, well above the 32-bit boundary but safely
   * under `Number.MAX_SAFE_INTEGER` (53 bits) — arithmetic stays exact.
   *
   * @param s   uppercase letters, digits, and underscore; ≤8 chars, and the
   *            first character must be a letter ([A-Z])
   * @throws   on empty input, length > 8, any out-of-alphabet character, or a
   *           first character that is not a letter
   */
  static from(s: string): number {
    if (s.length === 0) {
      throw new Error("SlugName.from: empty input")
    }
    if (s.length > 8) {
      throw new Error(`SlugName.from: '${s}' is longer than 8 chars`)
    }
    if (!SlugAlphabetPattern.test(s)) {
      throw new Error(`SlugName.from: '${s}' has chars outside [A-Z0-9_]`)
    }
    if (!SlugLeadingAlphabetPattern.test(s)) {
      throw new Error(`SlugName.from: '${s}' must start with a letter ([A-Z])`)
    }
    let v = 0
    for (let i = 0; i < s.length; ++i) {
      const c = s.charCodeAt(i)
      let slot: number
      if (c >= 65 && c <= 90) {
        // A..Z → 1..26
        slot = 1 + (c - 65)
      } else if (c >= 48 && c <= 57) {
        // 0..9 → 27..36
        slot = 27 + (c - 48)
      } else if (c === 95) {
        // '_' → 37
        slot = 37
      } else {
        throw new Error(`SlugName.from: bad char in '${s}'`)
      }
      // Most-significant-symbol-first, mirroring slug_name.hpp exactly:
      // char[i] occupies bits [42-i*6 .. 47-i*6] (char[0] is the HIGH
      // slot, matching the contract-side `"X"_s` literals byte-for-byte).
      // Arithmetic (`*`/`+`) rather than `<<` because JS bitwise ops
      // truncate to 32-bit signed integers and every slot above char[5]
      // lives past bit 31.
      v += slot * Math.pow(2, 42 - i * 6)
    }
    return v
  }

  /**
   * Unpack a slug_name `uint64` (JS `number`) back to its string form.
   * Reads up to 8 6-bit slots; stops on slot 0 (terminator) or invalid slot.
   *
   * Like {@link from}, this uses arithmetic instead of bitwise operations
   * so multi-character codes whose value exceeds 2^31 round-trip cleanly.
   *
   * @param n   packed slug_name value
   */
  static toString(n: number): string {
    let out = ""
    for (let i = 0; i < 8; ++i) {
      // Slots read most-significant-first: char[i] at bits [42-i*6 ..
      // 47-i*6], matching `slug_name::to_string` in slug_name.hpp.
      const slot = Math.floor(n / Math.pow(2, 42 - i * 6)) % 64
      if (slot === 0) {
        break
      }
      if (slot >= 1 && slot <= 26) {
        out += String.fromCharCode(65 + slot - 1)
      } else if (slot >= 27 && slot <= 36) {
        out += String.fromCharCode(48 + slot - 27)
      } else if (slot === 37) {
        out += "_"
      } else {
        // Any non-zero slot outside the defined alphabet terminates the read.
        break
      }
    }
    return out
  }
}

/**
 * The transitional object carrier for a packed slug_name.
 *
 * With the ABI builtin absent, a slug converts through
 * `FC_REFLECT_TEMPLATE(basic_name<Traits>, (value))` and is therefore
 * object-only, so a pre-builtin depot emits this shape. The depot still
 * ACCEPTS it (`fc::slug_name::from_variant`), which is what lets a READER
 * straddle the landing window — a JSON writer cannot, since no value both
 * spellings accept.
 *
 * Delete this once no depot emits the object form; the bare string is the one
 * canonical carrier.
 */
export interface SlugNameObject {
  /** The packed uint64. `fc::json` quotes it once it exceeds `0xffffffff`. */
  value: number | string
}

/** Every carrier a slug_name cell can arrive in. */
export type SlugNameValue = string | number | bigint | SlugNameObject

/**
 * The packed numeric value of a slug cell, whatever carrier it arrived in.
 *
 * A bare string is ALWAYS parsed as a slug, never as a decimal — unambiguous
 * because a code must start with a letter, so no legal spelling can be read as
 * a number. A number or bigint is an already-packed value. An object is the
 * transitional {@link SlugNameObject} carrier.
 *
 * @param value  the cell, in any carrier
 * @param label  names the slug in the failure message (`Chain`, `Reserve`)
 * @throws if the result is not a non-zero safe integer, or a string is not a
 *         valid slug_name spelling
 */
export function slugValue(value: SlugNameValue, label: string): number {
  const packed = match(value)
    .with(P.string, spelling => SlugName.from(spelling))
    .with({ value: P.union(P.string, P.number) }, wrapped =>
      packedValue(wrapped.value, label)
    )
    .otherwise(alreadyPacked => packedValue(alreadyPacked, label))

  if (packed <= 0) {
    throw new Error(slugValueMessage(label))
  }

  return packed
}

/** The failure message every rejected slug carrier shares. */
function slugValueMessage(label: string): string {
  return `${label} slug must be a non-zero safe integer or valid slug_name string.`
}

/**
 * An already-packed slug value, parsed strictly. `UInt64.from` accepts only a
 * base-10 integer string or a safe integer, so `""`, `" 12 "`, `"0x10"`,
 * `"1e3"` and `"12abc"` are rejected rather than coerced the way `Number()` or
 * `parseInt()` would; `toNumber()` rejects anything past 53 bits.
 */
function packedValue(packed: string | number | bigint, label: string): number {
  return Either.try(() => UInt64.from(packed).toNumber())
    .ifLeft(cause => {
      throw new NestedError(slugValueMessage(label), {
        cause,
        context: { packed: String(packed) }
      })
    })
    .getOrThrow()
}
