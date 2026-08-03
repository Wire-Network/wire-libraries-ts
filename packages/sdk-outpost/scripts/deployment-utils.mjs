import Crypto from "node:crypto"
import Fs from "node:fs/promises"
import Path from "node:path"
import { fileURLToPath } from "node:url"

import { format } from "prettier"

export const PackagePath = Path.resolve(
    Path.dirname(fileURLToPath(import.meta.url)),
    ".."
  ),
  DeploymentDataPath = Path.join(PackagePath, "src/deployments/data"),
  CurrentDeploymentFile = Path.join(
    PackagePath,
    "src/deployments/current.json"
  ),
  GeneratedCatalogFile = Path.join(
    PackagePath,
    "src/deployments/generated/Catalog.ts"
  )

export async function pathExists(path) {
  try {
    await Fs.access(path)
    return true
  } catch {
    return false
  }
}

export async function sha256(path) {
  const contents = await Fs.readFile(path)
  return Crypto.createHash("sha256").update(contents).digest("hex")
}

export async function readJson(path) {
  return JSON.parse(await Fs.readFile(path, "utf8"))
}

export async function writeJson(path, value) {
  await Fs.mkdir(Path.dirname(path), { recursive: true })
  await Fs.writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

export async function readDeploymentDocuments() {
  const entries = await Fs.readdir(DeploymentDataPath, { withFileTypes: true })
  const documents = await Promise.all(
    entries
      .filter(entry => entry.isFile() && entry.name.endsWith(".json"))
      .map(entry => readJson(Path.join(DeploymentDataPath, entry.name)))
  )

  return documents.sort((left, right) =>
    left.artifactBundle.generatedAt.localeCompare(
      right.artifactBundle.generatedAt
    )
  )
}

export async function readCurrentDeploymentId() {
  const current = await readJson(CurrentDeploymentFile)
  if (typeof current.id !== "string" || current.id.length === 0) {
    throw new Error("Current deployment id is missing")
  }
  return current.id
}

export async function writeTypescript(path, source) {
  const formatted = await format(source, {
    parser: "typescript",
    semi: false,
    singleQuote: false,
    trailingComma: "none"
  })
  await Fs.mkdir(Path.dirname(path), { recursive: true })
  await Fs.writeFile(path, formatted)
}

export function deploymentAssetPath(family, deploymentId) {
  return Path.join(PackagePath, "src/assets", family, deploymentId)
}
