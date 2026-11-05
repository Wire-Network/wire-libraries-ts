import { spawnSync } from "node:child_process"
import { resolve } from "node:path"

enum ModuleFormat {
  esm = "esm",
  cjs = "cjs"
}

const NativeModuleTimeoutMs = 20_000

/** Exercise emitted Outpost exports and Anchor constructors without Jest transforms. */
const NativeOutpostChecks = `
  import assert from "node:assert/strict"
  import { createRequire } from "node:module"
  import { pathToFileURL } from "node:url"
  import { resolve } from "node:path"

  const require = createRequire(import.meta.url)
  const [format] = process.argv.slice(1)
  const load = async path => format === "esm"
    ? import(pathToFileURL(path).href)
    : require(path)
  const outpost = await load(resolve("lib", format, "index.js"))
  assert.equal(typeof outpost.OutpostClient.create, "function")
  const { BN } = await load(resolve("lib", format, "clients/solana/AnchorCompat.js"))
  assert.equal(BN, require("@coral-xyz/anchor").BN)
  assert.equal(new BN("18446744073709551615").toString(), "18446744073709551615")
`

describe("native Outpost module interoperability", () => {
  test.each(Object.values(ModuleFormat))(
    "%s loads the public client and preserves Anchor's BN constructor",
    format => {
      const result = spawnSync(
        process.execPath,
        ["--input-type=module", "--eval", NativeOutpostChecks, format],
        {
          cwd: resolve(__dirname, "../.."),
          encoding: "utf8",
          timeout: NativeModuleTimeoutMs
        }
      )
      expect(result.error).toBeUndefined()
      expect({
        status: result.status,
        diagnostics: result.status ? result.stderr : ""
      }).toEqual({ status: 0, diagnostics: "" })
    }
  )
})
