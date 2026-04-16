import { screamingSnakeToPascalCase, protoNameToRust } from "../util/names.js"
import { log } from "../util/logger.js"

/**
 * Descriptor for a single enum value (variant).
 */
export interface EnumValueDescriptor {
  name: string
  number: number
}

/**
 * Descriptor subset for a protobuf enum needed by the codegen.
 */
export interface EnumDescriptor {
  /** Simple name (e.g. "Role") */
  name: string
  /** Fully qualified name (e.g. "example.Role") */
  fullName: string
  /** Enum values (variants) */
  values: EnumValueDescriptor[]
}

/**
 * Generate a complete Rust enum definition with Default, From<i32>,
 * and Into<i32> implementations.
 *
 * Uses `#[repr(i32)]` so the enum is wire-compatible with protobuf
 * varint encoding and castable to/from i32 directly.
 */
export function genEnum(desc: EnumDescriptor): string {
  const enumName = protoNameToRust(desc.fullName)
  log.debug(`Generating enum ${enumName} (${desc.values.length} values)`)

  const defaultVariant = desc.values.find(v => v.number === 0)
  const defaultVariantName = defaultVariant
    ? screamingSnakeToPascalCase(defaultVariant.name)
    : desc.values.length > 0
      ? screamingSnakeToPascalCase(desc.values[0].name)
      : "Unknown"

  const variants = desc.values.map(
    v => `    ${screamingSnakeToPascalCase(v.name)} = ${v.number},`
  )

  const matchArms = desc.values.map(
    v =>
      `            ${v.number} => ${enumName}::${screamingSnakeToPascalCase(v.name)},`
  )

  return [
    `#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]`,
    `#[cfg_attr(feature = "borsh", derive(borsh::BorshSerialize, borsh::BorshDeserialize))]`,
    `#[repr(i32)]`,
    `pub enum ${enumName} {`,
    ...variants,
    `}`,
    ``,
    `impl Default for ${enumName} {`,
    `    fn default() -> Self {`,
    `        ${enumName}::${defaultVariantName}`,
    `    }`,
    `}`,
    ``,
    `impl From<i32> for ${enumName} {`,
    `    fn from(value: i32) -> Self {`,
    `        match value {`,
    ...matchArms,
    `            _ => ${enumName}::default(),`,
    `        }`,
    `    }`,
    `}`,
    ``,
    `impl From<${enumName}> for i32 {`,
    `    fn from(value: ${enumName}) -> Self {`,
    `        value as i32`,
    `    }`,
    `}`
  ].join("\n")
}
