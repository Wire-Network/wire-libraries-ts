import degit from "degit"
import Path from "node:path"
import Fs from "node:fs"
import { log } from "../util/logger.js"

export interface FetchProtosOptions {
  repo: string
  outputDir: string
}

export async function fetchProtos(
  opts: FetchProtosOptions
): Promise<string[]> {
  const protoDir = Path.join(opts.outputDir, "proto")

  log.info("Fetching protos from %s → %s", opts.repo, protoDir)

  if (opts.repo.startsWith("file://")) {
    await copyLocalProtos(opts.repo, protoDir)
  } else {
    await cloneRemoteProtos(opts.repo, protoDir)
  }

  const protos = walkDir(protoDir).filter(f => f.endsWith(".proto"))

  if (protos.length === 0) {
    throw new Error(
      `No .proto files found after cloning ${opts.repo} into ${protoDir}`
    )
  }

  log.info("Found %d .proto file(s)", protos.length)
  return protos
}

async function cloneRemoteProtos(
  repo: string,
  protoDir: string
): Promise<void> {
  const emitter = degit(repo, {
    cache: false,
    force: true,
    verbose: true
  })

  emitter.on("info", info => {
    log.debug("degit: %s", info.message)
  })

  await emitter.clone(protoDir)
}

async function copyLocalProtos(
  repo: string,
  protoDir: string
): Promise<void> {
  const localPath = Path.resolve(repo.replace(/^file:\/\//, ""))

  if (!Fs.existsSync(localPath)) {
    throw new Error(`Local path does not exist: ${localPath}`)
  }

  if (!Fs.statSync(localPath).isDirectory()) {
    throw new Error(`Local path is not a directory: ${localPath}`)
  }

  log.debug("Copying local protos from %s → %s", localPath, protoDir)
  Fs.cpSync(localPath, protoDir, { recursive: true })
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
