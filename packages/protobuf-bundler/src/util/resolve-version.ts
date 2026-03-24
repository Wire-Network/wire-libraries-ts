import { execSync } from "node:child_process"
import { log } from "./logger.js"

/**
 * Query npm for the latest published version of a package,
 * then return that version with the patch number incremented by 1.
 *
 * Throws if the package exists but the version cannot be determined.
 */
export function resolveNextVersion(packageName: string): string {
  log.info("Resolving latest version of %s from npm…", packageName)

  let raw: string
  try {
    raw = execSync(`npm show ${packageName} version`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim()
  } catch (err: any) {
    // npm show exits non-zero when the package doesn't exist at all
    const stderr: string = err.stderr?.toString() ?? ""
    if (stderr.includes("E404") || stderr.includes("is not in this registry")) {
      throw new Error(
        `Package "${packageName}" not found on npm. ` +
          `Cannot auto-resolve version — please supply --package-version explicitly.`
      )
    }
    throw new Error(
      `Failed to query npm for "${packageName}": ${err.message}`
    )
  }

  if (!raw) {
    throw new Error(
      `npm returned an empty version string for "${packageName}". ` +
        `Cannot auto-resolve version — please supply --package-version explicitly.`
    )
  }

  const match = raw.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) {
    throw new Error(
      `npm returned an unparseable version "${raw}" for "${packageName}". ` +
        `Cannot auto-resolve version — please supply --package-version explicitly.`
    )
  }

  const major = match[1]
  const minor = match[2]
  const patch = parseInt(match[3], 10) + 1
  const next = `${major}.${minor}.${patch}`

  log.info("Current version: %s → next version: %s", raw, next)
  return next
}
