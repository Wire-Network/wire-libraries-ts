#!/usr/bin/env node

/**
 * Remove compiled sdk-outpost package outputs.
 *
 * Usage:
 *   ./scripts/sdk-outpost/clean.mjs
 *
 * Options:
 *   None.
 *
 * Examples:
 *   ./scripts/sdk-outpost/clean.mjs
 *
 * Exit codes:
 *   0 on success; nonzero when an output cannot be removed.
 */

import { fs, path } from "zx"

import { PackagePath } from "./config.mjs"

await fs.rm(path.join(PackagePath, "lib"), { force: true, recursive: true })
