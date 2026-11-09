import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const packages = ["shared", "sdk-core", "sdk-outpost"]

// Exercise Node's actual module loaders, outside ts-jest and bundler aliases.
for (const name of packages) {
  const directory = new URL(`../packages/${name}/`, import.meta.url)
  execFileSync(process.execPath, [
    fileURLToPath(new URL("./fix-hybrid-output.mjs", import.meta.url)),
    fileURLToPath(directory)
  ])
  const commonjs = require(
    fileURLToPath(new URL("lib/cjs/index.js", directory))
  )
  const esm = await import(new URL("lib/esm/index.js", directory).href)
  assert.ok(Object.keys(commonjs).length > 0, `${name} CJS exports`)
  assert.deepEqual(
    Object.keys(esm).sort(),
    Object.keys(commonjs).sort(),
    `${name} ESM/CJS exports`
  )
  if (name === "sdk-outpost") {
    const commonjsAnchor = require(
      fileURLToPath(new URL("lib/cjs/clients/solana/Anchor.js", directory))
    )
    const esmAnchor = await import(
      new URL("lib/esm/clients/solana/Anchor.js", directory).href
    )
    for (const module of [commonjsAnchor, esmAnchor]) {
      assert.equal(
        new module.BN("9007199254740993").toString(),
        "9007199254740993"
      )
    }
  }
  console.log(`${name}: native CJS and ESM imports passed`)
}
