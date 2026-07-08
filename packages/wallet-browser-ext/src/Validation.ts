import { Name } from "@wireio/sdk-core"

const AccountNameMaxLength = 12

/** Return true when the wallet account name is canonical and fits account-name length limits. */
export function isValidAccountName(name: string): boolean {
  return (
    name.length >= 1 &&
    name.length <= AccountNameMaxLength &&
    Name.isValid(name)
  )
}

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

export function isValidKeyName(name: string, existingNames: string[]): boolean {
  if (!name.trim()) return false
  return !existingNames.includes(name.trim())
}

export function isValidEndpointName(
  name: string,
  existingNames: string[]
): boolean {
  if (!name.trim()) return false
  return !existingNames.includes(name.trim())
}
