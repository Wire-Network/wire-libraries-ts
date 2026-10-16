#!/usr/bin/env node
/**
 * Verify live-harness startup failures remove private configuration.
 * Requires the same compiled SDK and WIRE_COUNCIL_BIND_PROVIDER as the live run.
 * WIRE_COUNCIL_RUN_DIRECTORY must name a new directory; retain it for diagnostics.
 */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const TimeoutMs = 60_000
const FailureCases = ["missing", "not-executable"]
const DiagnosticCodes = { missing: /ENOENT/, "not-executable": /EACCES/ }
const root = process.env.WIRE_COUNCIL_RUN_DIRECTORY
assert(root, "WIRE_COUNCIL_RUN_DIRECTORY is required")
assert(
  process.env.WIRE_COUNCIL_BIND_PROVIDER,
  "WIRE_COUNCIL_BIND_PROVIDER is required"
)
mkdirSync(root, { recursive: false, mode: 0o700 })

/** Use real process launch failures and the real bind registry without opening listeners. */
FailureCases.forEach(failure => {
  const runDirectory = resolve(root, failure)
  const executable = resolve(root, `${failure}-nodeop`)
  if (failure === "not-executable") {
    writeFileSync(executable, "#!/bin/sh\nexit 0\n", { mode: 0o600 })
  }
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./test-council-live.mjs", import.meta.url))],
    {
      env: {
        ...process.env,
        WIRE_COUNCIL_NODEOP: executable,
        WIRE_COUNCIL_CONTRACTS: root,
        WIRE_COUNCIL_RUN_DIRECTORY: runDirectory
      },
      encoding: "utf8",
      timeout: TimeoutMs
    }
  )
  assert.ifError(result.error)
  assert.equal(result.signal, null)
  assert.equal(result.status, 1)
  assert.match(result.stderr, DiagnosticCodes[failure])
  assert(
    existsSync(join(runDirectory, "genesis.json")),
    "must reach node startup"
  )
  assert(
    !existsSync(join(runDirectory, "config/config.ini")),
    "private config must be removed"
  )
  assert(
    !existsSync(join(runDirectory, "result.json")),
    "failed startup must not report success"
  )
  assert(
    !readFileSync(join(runDirectory, "nodeop.log"), "utf8").includes("PVT_")
  )
  console.log(
    `${failure}: startup diagnostic retained and private config removed`
  )
})
