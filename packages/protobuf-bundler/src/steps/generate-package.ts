import Fs from "node:fs"
import Path from "node:path"
import { fileURLToPath } from "node:url"
import { log } from "../util/logger.js"
import { renderTemplate } from "../util/templates.js"
import { deepMerge } from "../util/merge.js"
import type { Target } from "./run-protoc.js"

// const __filename = fileURLToPath(import.meta.url)
// const __dirname = Path.dirname(__filename)

/**
 * Read the bundler's own package.json to extract dependency versions.
 */
function readBundlerPackageJson(): Record<string, any> {
  const candidates = [
    
    Path.join(__dirname, "../../package.json"),
    Path.join(__dirname, "../../../package.json")
  ]
  for (const candidate of candidates) {
    if (Fs.existsSync(candidate)) {
      return JSON.parse(Fs.readFileSync(candidate, "utf-8"))
    }
  }
  throw new Error("Could not find wire-protobuf-bundler package.json")
}

export interface GeneratePackageOptions {
  target: Target
  outputDir: string
  packageName: string
  packageVersion: string
  packageData: Record<string, any>
  generatedFiles: string[]
  genDir: string
  repo: string
}

export async function generatePackage(
  opts: GeneratePackageOptions
): Promise<void> {
  log.info("Generating %s package in %s", opts.target, opts.outputDir)

  if (opts.target === "solana") {
    await generateSolanaPackage(opts)
  } else {
    await generateSolidityPackage(opts)
  }

  log.info("Package generation complete")
}

/**
 * Strip `.pb` from a filename.
 * e.g. "Types.pb.sol" → "Types.sol", "types.pb.rs" → "types.rs"
 */
function stripPb(filename: string): string {
  return filename.replace(/\.pb\.(\w+)$/, ".$1")
}

// ─── Solana (Rust crate) ────────────────────────────────────────────────────

async function generateSolanaPackage(
  opts: GeneratePackageOptions
): Promise<void> {
  const {
    outputDir, packageName, packageVersion, packageData, generatedFiles,
    genDir, repo
  } = opts

  const defaults: Record<string, any> = {
    packageName,
    version: packageVersion,
    repo,
    modules: [] as string[],
    dependencies: {}
  }
  const context = deepMerge(defaults, packageData)

  const srcDir = Path.join(outputDir, "src")
  Fs.mkdirSync(srcDir, { recursive: true })

  // Copy generated .rs files preserving directory structure, stripping .pb
  const relPaths: string[] = []
  for (const file of generatedFiles) {
    const rel = Path.relative(genDir, file)
    const cleaned = Path.join(
      Path.dirname(rel),
      stripPb(Path.basename(rel))
    )
    const destPath = Path.join(srcDir, cleaned)
    Fs.mkdirSync(Path.dirname(destPath), { recursive: true })
    Fs.copyFileSync(file, destPath)
    if (cleaned.endsWith(".rs")) {
      relPaths.push(cleaned)
    }
  }

  // Build the Rust module tree: generate mod.rs files + lib.rs barrel
  const moduleTree = buildModuleTree(
    relPaths.filter(p => Path.basename(p) !== "protobuf_runtime.rs")
  )
  writeModFiles(srcDir, moduleTree)

  // Build lib.rs content
  const topModules = Object.keys(moduleTree).sort()
  const reexports = collectLeafModulePaths(moduleTree, [])
  context.modules = topModules
  context.reexports = reexports

  const cargoToml = renderTemplate("solana/Cargo.toml.hbs", context)
  Fs.writeFileSync(Path.join(outputDir, "Cargo.toml"), cargoToml)

  const libRs = renderTemplate("solana/src/lib.rs.hbs", context)
  Fs.writeFileSync(Path.join(srcDir, "lib.rs"), libRs)

  const readme = renderTemplate("solana/README.md.hbs", context)
  Fs.writeFileSync(Path.join(outputDir, "README.md"), readme)
}

/**
 * A node in the module tree. Keys are directory/module names.
 * Leaf files are stored under `_files`.
 */
interface ModuleNode {
  [key: string]: ModuleNode | string[]
  _files: string[]
}

function newModuleNode(): ModuleNode {
  return { _files: [] } as ModuleNode
}

/**
 * Build a tree from relative .rs file paths.
 * e.g. ["sysio/opp/types/types.rs", "sysio/opp/opp.rs"]
 * becomes { sysio: { opp: { types: { _files: ["types"] }, _files: ["opp"] } } }
 */
function buildModuleTree(relPaths: string[]): ModuleNode {
  const root = newModuleNode()
  for (const rel of relPaths) {
    const parts = rel.replace(/\.rs$/, "").split(Path.sep)
    const filename = parts.pop()!
    let node = root
    for (const dir of parts) {
      if (!node[dir] || typeof node[dir] === "string") {
        ;(node as any)[dir] = newModuleNode()
      }
      node = node[dir] as ModuleNode
    }
    node._files.push(filename)
  }
  return root
}

/**
 * Write mod.rs files for each directory level in the module tree.
 */
function writeModFiles(baseDir: string, tree: ModuleNode): void {
  const dirs = Object.keys(tree).filter(k => k !== "_files")
  if (dirs.length === 0 && tree._files.length === 0) return

  for (const dir of dirs) {
    const subTree = tree[dir] as ModuleNode
    const subDir = Path.join(baseDir, dir)
    Fs.mkdirSync(subDir, { recursive: true })

    // Collect child modules for this mod.rs
    const childDirs = Object.keys(subTree).filter(k => k !== "_files")
    const childFiles = subTree._files || []

    const lines = ["// Auto-generated by protobuf-bundler — do not edit", ""]
    for (const d of childDirs.sort()) {
      lines.push(`pub mod ${d};`)
    }
    for (const f of childFiles.sort()) {
      lines.push(`pub mod ${f};`)
    }
    lines.push("")

    Fs.writeFileSync(Path.join(subDir, "mod.rs"), lines.join("\n"))

    // Recurse
    writeModFiles(subDir, subTree)
  }
}

/**
 * Collect fully-qualified module paths to all leaf .rs modules
 * for re-export in lib.rs.
 * e.g. ["sysio::opp::types::types", "sysio::opp::opp"]
 */
function collectLeafModulePaths(
  tree: ModuleNode,
  prefix: string[]
): string[] {
  const results: string[] = []
  const dirs = Object.keys(tree).filter(k => k !== "_files")

  for (const f of tree._files || []) {
    results.push([...prefix, f].join("::"))
  }
  for (const d of dirs) {
    results.push(
      ...collectLeafModulePaths(tree[d] as ModuleNode, [...prefix, d])
    )
  }
  return results.sort()
}

// ─── Solidity (npm package) ─────────────────────────────────────────────────

async function generateSolidityPackage(
  opts: GeneratePackageOptions
): Promise<void> {
  const {
    outputDir, packageName, packageVersion, packageData, generatedFiles,
    genDir, repo
  } = opts

  const bundlerPkg = readBundlerPackageJson()
  const protobufTsRuntimeVersion =
    bundlerPkg.dependencies?.["@protobuf-ts/runtime"] ?? "^2.9.4"

  const defaults: Record<string, any> = {
    packageName,
    version: packageVersion,
    repo,
    protobufTsRuntimeVersion
  }
  const context = deepMerge(defaults, packageData)

  // Separate additional fields from known template fields for package.json
  const knownFields = new Set([
    "packageName",
    "version",
    "repo",
    "protobufTsRuntimeVersion",
    "additionalFields"
  ])
  const additionalFields: Record<string, any> = {}
  for (const [key, value] of Object.entries(context)) {
    if (!knownFields.has(key)) {
      additionalFields[key] = value
    }
  }
  if (Object.keys(additionalFields).length > 0) {
    context.additionalFields = additionalFields
  }

  const contractsDir = Path.join(outputDir, "contracts")
  Fs.mkdirSync(contractsDir, { recursive: true })

  // Copy generated .sol files preserving directory structure, stripping .pb
  for (const file of generatedFiles) {
    const rel = Path.relative(genDir, file)
    const cleaned = Path.join(
      Path.dirname(rel),
      stripPb(Path.basename(rel))
    )
    const destPath = Path.join(contractsDir, cleaned)
    Fs.mkdirSync(Path.dirname(destPath), { recursive: true })
    Fs.copyFileSync(file, destPath)
  }

  const packageJson = renderTemplate("solidity/package.json.hbs", context)
  Fs.writeFileSync(Path.join(outputDir, "package.json"), packageJson)

  const readme = renderTemplate("solidity/README.md.hbs", context)
  Fs.writeFileSync(Path.join(outputDir, "README.md"), readme)
}
