/**
 * Convert a protobuf fully-qualified name to a Rust-safe identifier (PascalCase struct name).
 * e.g. "my_package.MyMessage" → "MyMessage"
 */
export function protoNameToRust(fqn: string): string {
  const parts = fqn.split(".")
  return parts[parts.length - 1]
}

/**
 * Keep snake_case field name as-is for Rust struct members.
 * e.g. "user_name" → "user_name"
 * Only converts camelCase → snake_case if needed.
 */
export function toSnakeCase(name: string): string {
  // Already snake_case in proto, but handle camelCase just in case
  return name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase()
}

/**
 * Generate output .rs filename for a given .proto file, optionally rooted
 * under a directory derived from the proto package name.
 * e.g. "my_service.proto" with package "example.nested"
 *      → "example/nested/my_service.rs"
 */
export function protoFileToRsFile(protoFile: string, packageName?: string): string {
  const base = protoFile.replace(/\.proto$/, "")
  const parts = base.split("/")
  const filename = parts[parts.length - 1]
  // Rust files use snake_case
  const snakeFilename = filename
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
  const rsBasename = `${snakeFilename}.rs`
  if (!packageName) return rsBasename
  const dir = packageName.split(".").join("/")
  return `${dir}/${rsBasename}`
}
