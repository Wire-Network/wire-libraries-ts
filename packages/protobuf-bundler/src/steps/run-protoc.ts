import { execFileSync, execSync } from "node:child_process"
import Path from "node:path"
import Fs from "node:fs"
import { log } from "../util/logger.js"

export type Target = "solana" | "solidity"

export interface RunProtocOptions {
  target: Target
  protoFiles: string[]
  protoDir: string
  outputDir: string
}

export interface PluginSetup {
  pkg: string
  bin: string
  outFlag: string
}

const PLUGIN_MAP: Record<
  Target,
  PluginSetup
> = {
  solana: {
    pkg: "@wireio/protoc-gen-solana",
    bin: "protoc-gen-solana",
    outFlag: "--solana_out"
  },
  solidity: {
    pkg: "@wireio/protoc-gen-solidity",
    bin: "protoc-gen-solidity",
    outFlag: "--solidity_out"
  }
}

/**
 * Resolve a plugin binary. Search order:
 *   1. pkg binary inside the installed npm package (dist/bin/<name>)
 *   2. System PATH
 *   3. node_modules/.bin wrapper (fallback)
 */
export function resolvePluginBin(name: string, npmPkg: string): string {
  // 1. Look for the pkg binary inside the installed npm package
  const pkgBinCandidates = [
    Path.join("node_modules", ".bin", name), 
    Path.join("node_modules", npmPkg, "dist", "bin", name),
    Path.join("node_modules", ".pnpm", "node_modules", npmPkg, "dist", "bin", name)
  ]
  for (const candidate of pkgBinCandidates) {
    if (Fs.existsSync(candidate)) {
      const resolved = Path.resolve(candidate)
      log.debug("Found pkg binary at: %s", resolved)
      return resolved
    }
  }

  // 2. Check system PATH
  try {
    const result = execSync(`which ${name}`, { stdio: "pipe" })
      .toString()
      .trim()
    if (result) return result
  } catch {
    // not on PATH
  }

  // 3. Fall back to node_modules/.bin
  const localBin = Path.join("node_modules", ".bin", name)
  if (Fs.existsSync(localBin)) {
    return Path.resolve(localBin)
  }

  throw new Error(
    `Plugin binary "${name}" not found. Install ${npmPkg} or ensure ${name} is on PATH.`
  )
}

/**
 * Determine the best --proto_path root. Proto files use import paths
 * relative to a root directory. If the cloned content has a "proto/" or
 * "protos/" subdirectory, that is likely the import root.
 */
export function findProtoRoot(baseDir: string): string {
  for (const candidate of ["proto", "protos"]) {
    const dir = Path.join(baseDir, candidate)
    if (Fs.existsSync(dir) && Fs.statSync(dir).isDirectory()) {
      log.debug("Found proto root subdirectory: %s", dir)
      return dir
    }
  }
  return baseDir
}

export async function runProtoc(opts: RunProtocOptions): Promise<string[]> {
  const pluginInfo = PLUGIN_MAP[opts.target]

  const pluginBin = resolvePluginBin(pluginInfo.bin, pluginInfo.pkg)
  log.debug("Resolved plugin binary: %s → %s", pluginInfo.bin, pluginBin)

  const genDir = Path.join(opts.outputDir, "generated")
  Fs.mkdirSync(genDir, { recursive: true })

  // Find the correct proto root for import resolution
  const protoRoot = findProtoRoot(opts.protoDir)

  const relativeProtos = opts.protoFiles.map(p =>
    Path.relative(protoRoot, p)
  )

  const args = [
    `--plugin=${pluginInfo.bin}=${pluginBin}`,
    `--proto_path=${protoRoot}`,
    `${pluginInfo.outFlag}=${genDir}`,
    ...relativeProtos
  ]

  log.info("Running: npx protoc %s", args.join(" "))

  try {
    execFileSync("npx", ["protoc", ...args], {
      stdio: ["pipe", "pipe", "inherit"]
    })
  } catch (err: any) {
    throw new Error(
      `protoc failed (exit ${err.status}): ${err.stderr?.toString() ?? err.message}`
    )
  }

  const generated = walkDir(genDir)
  log.info("protoc generated %d file(s)", generated.length)
  return generated
}

function walkDir(dir: string): string[] {
  const results: string[] = []
  if (!Fs.existsSync(dir)) return results
  for (const entry of Fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = Path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath))
    } else {
      results.push(fullPath)
    }
  }
  return results
}
