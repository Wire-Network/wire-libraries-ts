import Fs from "node:fs/promises"
import Path from "node:path"

import { PackagePath } from "./deployment-utils.mjs"

await Fs.rm(Path.join(PackagePath, "lib"), { force: true, recursive: true })
