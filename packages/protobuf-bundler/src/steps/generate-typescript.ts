import { execFileSync } from "node:child_process"
import Fs from "node:fs"
import Path from "node:path"
import { fileURLToPath } from "node:url"
import { log } from "../util/logger.js"
import { renderTemplate } from "../util/templates.js"
import { resolvePluginBin, findProtoRoot } from "./run-protoc.js"
import { removeSymLinkDirectory } from "../util/filesystem-helper.js"
import { tmpdir } from "node:os"
import Assert from "node:assert"

// const __filename = fileURLToPath(import.meta.url)
// const __dirname = Path.dirname(__filename)

export interface GenerateTypescriptOptions {
  protoFiles: string[]
  protoDir: string
  tmpDir: string
  outputDir: string
}

/**
 * Strip `.pb` from a filename.
 * e.g. "Types.pb.ts" → "Types.ts"
 */
function stripPb(filename: string): string {
  return filename.replace(/\.pb\.(\w+)$/, ".$1")
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

/**
 * Find the nearest node_modules directory containing @protobuf-ts/runtime.
 * Searches upward from startDir.
 */
function findNodeModules(startDir: string): string {
  let dir = startDir
  while (true) {
    const candidate = Path.join(dir, "node_modules")
    if (
      Fs.existsSync(candidate) &&
      Fs.existsSync(Path.join(candidate, "@protobuf-ts", "runtime"))
    ) {
      return candidate
    }
    const parent = Path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(
    "Could not find node_modules containing @protobuf-ts/runtime. " +
    "Ensure @protobuf-ts/runtime is installed."
  )
}

/**
 * Generate TypeScript types from proto files alongside the Solidity output.
 *
 * 1. Runs protoc with protoc-gen-ts (@protobuf-ts/plugin)
 * 2. Copies .ts files to outputDir, stripping .pb from names
 * 3. Generates barrel index.ts
 * 4. Compiles with tsc to produce .js + .d.ts
 * 5. Renames index.js → index.mjs
 */
export async function generateTypescript(
  opts: GenerateTypescriptOptions
): Promise<void> {
  const { protoFiles, protoDir, tmpDir, outputDir } = opts

  // ── Step 1: Run protoc with protoc-gen-ts ──────────────────────────────
  const outputNodeModules = Path.join(outputDir, "node_modules")
  
  const tsOutputDir = Path.join(tmpDir, "ts")
  const tsGenDir = Path.join(tsOutputDir, "generated")
  Fs.mkdirSync(tsGenDir, { recursive: true })

  const pluginBin = resolvePluginBin("protoc-gen-ts", "@protobuf-ts/plugin")
  log.debug("Resolved protoc-gen-ts binary: %s", pluginBin)

  const protoRoot = findProtoRoot(protoDir)
  const relativeProtos = protoFiles.map(p => Path.relative(protoRoot, p))

  const args = [
    `--plugin=protoc-gen-ts=${pluginBin}`,
    `--proto_path=${protoRoot}`,
    `--ts_out=${tsGenDir}`,
    ...relativeProtos
  ]

  log.info("Running protoc for TypeScript: npx protoc %s", args.join(" "))

  // @protobuf-ts/plugin@2.11.1 uses deprecated ts.create* factory APIs that
  // were removed in TypeScript 5.x. Inject a compatibility shim via
  // NODE_OPTIONS so it is loaded before the plugin imports typescript.
  // const shimBasePath = "lib/TypescriptFactoryShim.js",
  //   shimPath = Path.resolve(__dirname, "../..", shimBasePath),
  //   shimContent = Fs.readFileSync(shimPath, "utf-8"),
  //   shimTmpDir = Path.join(tmpdir(),"wire-proto-"),
  //   shimTmpFile = Path.join(shimTmpDir, "ts-factory-shim.js")
  // Fs.mkdtempSync(shimTmpDir)
  // Assert.ok(Fs.lstatSync(shimTmpDir).isDirectory())
  //
  const existingNodeOpts = process.env.NODE_OPTIONS || ""
  // const nodeOptions = `--require ${shimPath} ${existingNodeOpts}`.trim()

  try {
    execFileSync("npx", ["protoc", ...args], {
      stdio: ["pipe", "pipe", "inherit"],
      // env: { ...process.env, NODE_OPTIONS: nodeOptions }
    })
  } catch (err: any) {
    throw new Error(
      `protoc (TypeScript) failed (exit ${err.status}): ${err.stderr?.toString() ?? err.message}`
    )
  }

  // ── Step 2: Copy .ts files to outputDir, stripping .pb ─────────────────

  const tsFiles = walkDir(tsGenDir).filter(f => f.endsWith(".ts"))
  log.info("protoc-gen-ts generated %d file(s)", tsFiles.length)

  const tsModules: string[] = []

  for (const file of tsFiles) {
    const rel = Path.relative(tsGenDir, file)
    const cleaned = Path.join(
      Path.dirname(rel),
      stripPb(Path.basename(rel))
    )

    // Fail fast if TS output would collide with contracts/
    const firstSegment = cleaned.split(Path.sep)[0]
    if (firstSegment === "contracts") {
      throw new Error(
        `TypeScript generation would place files under "contracts/" ` +
        `which collides with the Solidity contracts directory. ` +
        `Proto path "${rel}" maps to "${cleaned}".`
      )
    }

    const dest = Path.join(outputDir, cleaned)
    Fs.mkdirSync(Path.dirname(dest), { recursive: true })
    Fs.copyFileSync(file, dest)
    tsModules.push(cleaned)
  }

  // ── Step 3: Generate barrel index.ts ───────────────────────────────────

  const lines = ["// Auto-generated by protobuf-bundler — do not edit", ""]
  for (const mod of tsModules.sort()) {
    const importPath =
      "./" + mod.replace(/\.ts$/, ".js").split(Path.sep).join("/")
    lines.push(`export * from "${importPath}";`)
  }
  lines.push("")

  Fs.writeFileSync(Path.join(outputDir, "index.ts"), lines.join("\n"))

  // ── Step 4: Write tsconfig.json ────────────────────────────────────────

  const tsconfig = renderTemplate("solidity/tsconfig.json.hbs", {})
  Fs.writeFileSync(Path.join(outputDir, "tsconfig.json"), tsconfig)

  // ── Step 5: Symlink node_modules for @protobuf-ts/runtime resolution ──

  // Search from project root (relative to compiled output location) and cwd
  const searchDirs = [
    Path.resolve(__dirname, "../.."),
    Path.resolve(__dirname, "../../.."),
    process.cwd()
  ]

  let bundlerNodeModules: string | undefined
  for (const dir of searchDirs) {
    try {
      bundlerNodeModules = findNodeModules(dir)
      break
    } catch {
      // try next
    }
  }
  if (!bundlerNodeModules) {
    throw new Error(
      "Could not find node_modules containing @protobuf-ts/runtime. " +
      "Ensure @protobuf-ts/runtime is installed."
    )
  }

  
  
  await removeSymLinkDirectory(outputNodeModules)
  
  log.info(
    "Creating temporary node_modules symlink: %s → %s",
    outputNodeModules,
    bundlerNodeModules
  )
  // Fs.symlinkSync(bundlerNodeModules, tmpNodeModules, "junction")

  // ── Step 6: Run tsc ────────────────────────────────────────────────────

  try {
    log.info("Compiling TypeScript in %s", outputDir)
    execFileSync(
      "npx",
      ["tsc", "-p", Path.join(outputDir, "tsconfig.json")],
      {
        stdio: ["pipe", "pipe", "inherit"],
        cwd: outputDir
      }
    )
  } finally {
    // Always clean up the symlink
    try {
      Fs.rmSync(outputNodeModules, { recursive: true, force: true })
      log.debug("Removed temporary node_modules symlink")
    } catch {
      log.warn("Failed to remove temporary node_modules symlink at %s", outputNodeModules)
    }
  }

  // ── Step 7: Rename index.js → index.mjs ────────────────────────────────

  // const indexJs = Path.join(outputDir, "index.js")
  // const indexMjs = Path.join(outputDir, "index.mjs")
  // if (Fs.existsSync(indexJs)) {
  //   Fs.renameSync(indexJs, indexMjs)
  //   log.debug("Renamed index.js → index.mjs")
  // }

  log.info("TypeScript generation complete: %d module(s)", tsModules.length)
}
