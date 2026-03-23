import Fs from "node:fs"
import Path from "node:path"
import Os from "node:os"
import { log } from "../util/logger.js"
import { fetchProtos } from "../steps/fetch-protos.js"
import { runProtoc, type Target } from "../steps/run-protoc.js"
import { generatePackage } from "../steps/generate-package.js"
import { generateTypescript } from "../steps/generate-typescript.js"

export interface BundleArgs {
  repo: string
  target: Target
  output: string
  packageName: string
  packageVersion: string
  packageData: Record<string, any>
}

export async function bundleCommand(args: BundleArgs): Promise<void> {
  const outputDir = Path.resolve(args.output)

  const tmpDir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "protobuf-bundler-"))
  log.debug("Using temp dir: %s", tmpDir)

  try {
    // Step 1: Fetch proto files from GitHub
    const protoFiles = await fetchProtos({
      repo: args.repo,
      outputDir: tmpDir
    })

    const protoDir = Path.join(tmpDir, "proto")

    // Step 2: Run protoc with the appropriate Wire plugin
    const generatedFiles = await runProtoc({
      target: args.target,
      protoFiles,
      protoDir,
      outputDir: tmpDir
    })

    // Step 3: Generate the publishable package
    Fs.mkdirSync(outputDir, { recursive: true })

    const genDir = Path.join(tmpDir, "generated")

    await generatePackage({
      target: args.target,
      outputDir,
      packageName: args.packageName,
      packageVersion: args.packageVersion,
      packageData: args.packageData,
      generatedFiles,
      genDir,
      repo: args.repo
    })

    // Step 4 (solidity only): Generate TypeScript types alongside contracts
    if (args.target === "solidity") {
      await generateTypescript({
        protoFiles,
        protoDir,
        tmpDir,
        outputDir
      })
    }

    // Copy proto sources to output for reference
    const protoOutDir = Path.join(outputDir, "proto")
    Fs.mkdirSync(protoOutDir, { recursive: true })
    for (const pf of protoFiles) {
      const relative = Path.relative(protoDir, pf)
      const dest = Path.join(protoOutDir, relative)
      Fs.mkdirSync(Path.dirname(dest), { recursive: true })
      Fs.copyFileSync(pf, dest)
    }

    log.info("Bundle complete → %s", outputDir)
  } finally {
    try {
      Fs.rmSync(tmpDir, { recursive: true, force: true })
      log.debug("Cleaned up temp dir: %s", tmpDir)
    } catch (err: any) {
      log.warn("Failed to clean temp dir %s: %s", tmpDir, err.message)
    }
  }
}
