export function isValidAccountName(name: string): boolean {
  return /^[a-z1-5.]{1,12}$/.test(name)
}

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

export function isValidKeyName(
  name: string,
  existingNames: string[]
): boolean {
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
