// noinspection ExceptionCaughtLocallyJS

import { execFileSync, execSync } from "node:child_process"
import Fs from "node:fs"
import Path from "node:path"
import Os from "node:os"
import { log } from "../util/logger.js"
import { fetchProtos } from "../steps/fetch-protos.js"
import { runProtoc, type Target } from "../steps/run-protoc.js"
import { generatePackage } from "../steps/generate-package.js"
import { generateTypescript } from "../steps/generate-typescript.js"
import { NestedError } from "@wireio/shared"

export interface BundleArgs {
  repo: string
  target: Target
  output: string
  packageName: string
  packageVersion: string
  packageData: Record<string, any>
  publish: boolean
}

let skipCleanup = false

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
    // For solidity, build in a staging dir so we can npm i + tsc before
    // copying to the final output location.
    const genDir = Path.join(tmpDir, "generated")
    const isSolidity = args.target === "solidity"
    const stagingDir = isSolidity ? Path.join(tmpDir, "staging") : outputDir

    Fs.mkdirSync(stagingDir, { recursive: true })

    await generatePackage({
      target: args.target,
      outputDir: stagingDir,
      packageName: args.packageName,
      packageVersion: args.packageVersion,
      packageData: args.packageData,
      generatedFiles,
      genDir,
      repo: args.repo
    })

    // Copy proto sources
    const protoOutDir = Path.join(stagingDir, "proto")
    Fs.mkdirSync(protoOutDir, { recursive: true })
    for (const pf of protoFiles) {
      const relative = Path.relative(protoDir, pf)
      const dest = Path.join(protoOutDir, relative)
      Fs.mkdirSync(Path.dirname(dest), { recursive: true })
      Fs.copyFileSync(pf, dest)
    }

    if (isSolidity) {
      // Step 4a: Generate TypeScript types into the staging dir
      await generateTypescript({
        protoFiles,
        protoDir,
        tmpDir,
        outputDir: stagingDir
      })

      // Step 4b: Install dependencies in staging so tsc can resolve them
      log.info("Installing dependencies in staging dir…")
      execSync("npm i", {
        cwd: stagingDir,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "inherit"]
      })

      // Step 4c: Compile TypeScript (protobuf-ts clients require TS 3)
      log.info("Compiling TypeScript in %s", stagingDir)
      execFileSync(
        "npx",
        [
          "-y",
          "-p",
          "typescript@4",
          "tsc",
          "-b",
          Path.join(stagingDir, "tsconfig.json")
        ],
        {
          stdio: ["pipe", "pipe", "inherit"],
          cwd: stagingDir
        }
      )

      log.info("Fixing import extensions in %s", stagingDir)
      Array("tsconfig.cjs.json", "tsconfig.esm.json")
        .map(tsConfigFileName => Path.join(stagingDir, tsConfigFileName))
        .forEach(tsConfigPath => {
          execFileSync(
            "npx",
            [
              "-y",
              "-p",
              "tsc-alias",
              "tsc-alias",
              "-p",
              tsConfigPath,
              "-f",
              "-fe",
              ".js"
            ],
            {
              stdio: ["pipe", "pipe", "inherit"],
              cwd: stagingDir
            }
          )
        })

      // Step 4d: Copy everything except node_modules to output
      Fs.mkdirSync(outputDir, { recursive: true })
      copyDirExcluding(stagingDir, outputDir, new Set(["node_modules"]))

      // Step 4e: Install production dependencies in the output dir
      log.info("Installing dependencies in output dir…")
      execSync("npm i", {
        cwd: outputDir,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "inherit"]
      })
    }

    log.info("Bundle complete → %s", outputDir)

    // Step 5 (optional): Publish the generated package
    if (args.publish) {
      log.info("Publishing package from %s…", outputDir)
      try {
        const result = execSync("npm publish --access public", {
          cwd: outputDir,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"]
        })
        log.info("Published successfully: %s", result.trim())
      } catch (err: any) {
        const stderr: string = err.stderr?.toString() ?? ""
        NestedError.throwError(
          `npm publish failed: ${stderr || err.message}`,
          err
        )
      }
    }
  } catch (err: any) {
    skipCleanup = true
    log.error(`Bundle failed: ${err.message}`, err)
  } finally {
    if (!skipCleanup) {
      try {
        Fs.rmSync(tmpDir, { recursive: true, force: true })
        log.debug("Cleaned up temp dir: %s", tmpDir)
      } catch (err: any) {
        log.warn("Failed to clean temp dir %s: %s", tmpDir, err.message)
      }
    }
  }
}

/**
 * Recursively copy a directory tree, skipping entries whose names
 * appear in the `exclude` set.
 */
function copyDirExcluding(
  src: string,
  dest: string,
  exclude: Set<string>
): void {
  Fs.mkdirSync(dest, { recursive: true })
  for (const entry of Fs.readdirSync(src, { withFileTypes: true })) {
    if (exclude.has(entry.name)) continue
    const srcPath = Path.join(src, entry.name)
    const destPath = Path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirExcluding(srcPath, destPath, exclude)
    } else {
      Fs.copyFileSync(srcPath, destPath)
    }
  }
}
