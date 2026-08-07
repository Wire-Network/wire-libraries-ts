#!/usr/bin/env zx

import { fs, path } from "zx"

import { PackagePath } from "./config.mjs"

/** Remove compiled sdk-outpost package outputs. */
await fs.rm(path.join(PackagePath, "lib"), { force: true, recursive: true })
