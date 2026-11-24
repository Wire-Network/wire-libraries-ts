import { NestedError } from "@wireio/shared"
import { match } from "ts-pattern"

import {
  SysioBooleanDescriptorKind,
  SysioContractDefinitions,
  type SysioBooleanArrayDescriptor,
  type SysioBooleanDescriptor,
  type SysioBooleanStructDescriptor,
  type SysioContractName
} from "../../types/SysioContractTypes.js"
import type { SysioTableName, SysioTableRow } from "./Client.js"

/** JSON encoding of ABI `bool` false: abi_serializer packs a `bool` as a uint8. */
const EncodedFalse = 0

/** JSON encoding of ABI `bool` true. */
const EncodedTrue = 1

/** A JSON object, the encoding of an ABI struct value. */
type JsonObject = Record<string, unknown>

/** Returns the value as a JSON array, or throws when it is not one. */
function assertJsonArray(value: unknown, location: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new NestedError("ABI array value is not a JSON array", {
      context: { location, value }
    })
  }
  return value
}

/** Returns true when the value is a JSON object rather than an array or scalar. */
function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Returns the value as a JSON object, or throws when it is an array or scalar. */
function assertJsonObject(value: unknown, location: string): JsonObject {
  if (!isJsonObject(value)) {
    throw new NestedError("ABI struct value is not a JSON object", {
      context: { location, value }
    })
  }
  return value
}

/** Decodes one ABI `bool`, accepting only `0`, `1`, `false` and `true`. */
function normalizeBoolean(value: unknown, location: string): boolean {
  return match(value)
    .with(false, EncodedFalse, () => false)
    .with(true, EncodedTrue, () => true)
    .otherwise(() => {
      throw new NestedError("ABI bool value is not 0, 1, false or true", {
        context: { location, value }
      })
    })
}

/** Converts the `bool` values inside every element of an ABI array. */
function normalizeArray(
  value: unknown,
  descriptor: SysioBooleanArrayDescriptor,
  location: string
): unknown[] {
  return assertJsonArray(value, location).map((element, index) =>
    normalizeBooleans(element, descriptor.items, `${location}[${index}]`)
  )
}

/** Converts the `bool` values inside the described fields of an ABI struct. */
function normalizeStruct(
  value: unknown,
  descriptor: SysioBooleanStructDescriptor,
  location: string
): JsonObject {
  const object = assertJsonObject(value, location)

  return {
    ...object,
    ...Object.fromEntries(
      Object.entries(descriptor.fields)
        .filter(([field]) => Object.hasOwn(object, field))
        .map(([field, fieldDescriptor]) => [
          field,
          normalizeBooleans(
            object[field],
            fieldDescriptor,
            `${location}.${field}`
          )
        ])
    )
  }
}

/**
 * Converts the ABI `bool` values a descriptor locates inside a JSON value.
 * Null and absent values (optionals and binary extensions) pass through.
 */
function normalizeBooleans(
  value: unknown,
  descriptor: SysioBooleanDescriptor,
  location: string
): unknown {
  if (value == null) return value

  return match(descriptor)
    .with({ kind: SysioBooleanDescriptorKind.boolean }, () =>
      normalizeBoolean(value, location)
    )
    .with({ kind: SysioBooleanDescriptorKind.array }, array =>
      normalizeArray(value, array, location)
    )
    .with({ kind: SysioBooleanDescriptorKind.struct }, struct =>
      normalizeStruct(value, struct, location)
    )
    .exhaustive()
}

/**
 * Converts one JSON row of a generated system-contract table to its declared
 * row type. The node's JSON encodes every ABI `bool` as `0` or `1`; each value
 * the generated row descriptor locates, including inside nested structs and
 * arrays, becomes `false` or `true`. Values that are already booleans, null or
 * absent pass through, as do rows of tables that hold no `bool`.
 *
 * @param name - Generated short system-contract name.
 * @param tableName - Generated table name.
 * @param row - One row as `get_table_rows` returns it with `json: true`.
 * @returns The row with its declared `boolean` fields.
 * @throws NestedError naming the field when a located value is not a valid
 *   ABI `bool`, array or struct encoding.
 */
export function normalizeSysioTableRow<
  Name extends SysioContractName,
  TableName extends SysioTableName<Name>
>(
  name: Name,
  tableName: TableName,
  row: unknown
): SysioTableRow<Name, TableName> {
  const descriptor = SysioContractDefinitions[name].tableBooleans[tableName]

  return (
    descriptor
      ? normalizeBooleans(row, descriptor, `sysio.${name}::${tableName}`)
      : row
  ) as SysioTableRow<Name, TableName>
}
