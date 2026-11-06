import { spawnSync } from "node:child_process"
import { resolve } from "node:path"

enum ModuleFormat {
  esm = "esm",
  cjs = "cjs"
}

const NativeModuleTimeoutMs = 20_000

/** Run emitted JavaScript in native Node, outside Jest's module transforms. */
const NativeCurveChecks = `
  import assert from "node:assert/strict"
  import { createRequire } from "node:module"
  import { pathToFileURL } from "node:url"

  const require = createRequire(import.meta.url)
  const [modulePath, format] = process.argv.slice(1)
  const { getCurve, getNobleCurve } = format === "esm"
    ? await import(pathToFileURL(modulePath).href)
    : require(modulePath)
  const { ec } = require("elliptic")

  ;[["K1", "secp256k1"], ["EM", "secp256k1"], ["R1", "p256"]]
    .forEach(([type, name]) => {
      const actual = getCurve(type)
      const expected = new ec(name)
      assert.equal(actual.constructor, ec)
      assert.equal(getCurve(type), actual)
      assert.equal(getNobleCurve(type), getNobleCurve(type))
      assert.equal(
        actual.keyFromPrivate("1").getPublic(true, "hex"),
        expected.keyFromPrivate("1").getPublic(true, "hex")
      )
      const digest = new Uint8Array(32).fill(7)
      const signature = actual.keyFromPrivate("1").sign(digest)
      const reference = expected.keyFromPrivate("1").sign(digest)
      assert.equal(signature.r.toString(16), reference.r.toString(16))
      assert.equal(signature.s.toString(16), reference.s.toString(16))
      assert.equal(signature.recoveryParam, reference.recoveryParam)
    })

  assert.equal(getNobleCurve("K1"), getNobleCurve("EM"))
  assert.notEqual(getCurve("K1"), getCurve("EM"))
  assert.throws(() => getCurve("ED"), /ED25519 keys are not supported via elliptic/)
  assert.throws(() => getNobleCurve("ED"), /ED25519 keys are not supported via Noble/)
  ;["WA", "BLS", "unsupported"].forEach(type => {
    assert.throws(() => getCurve(type), { message: "Unknown curve type: " + type })
    assert.throws(() => getNobleCurve(type), { message: "Unknown curve type: " + type })
  })
`

/** Compare public SDK operations using deterministic keys in each native module format. */
const NativeSdkChecks = `
  import assert from "node:assert/strict"
  import { createRequire } from "node:module"
  import { pathToFileURL } from "node:url"
  import { resolve } from "node:path"

  const require = createRequire(import.meta.url)
  const [format] = process.argv.slice(1)
  const load = async path => format === "esm"
    ? import(pathToFileURL(path).href)
    : require(path)
  const core = await load(resolve("lib", format, "index.js"))
  const { KeyType, PrivateKey, Signature, Checksum160, Checksum256, Checksum512 } = core
  const nacl = require("tweetnacl")
  const seed = new Uint8Array(32).fill(1)
  const message = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
  const rows = [KeyType.K1, KeyType.R1, KeyType.EM, KeyType.ED, KeyType.BLS].map(type => {
    const secret = type === KeyType.ED ? nacl.sign.keyPair.fromSeed(seed).secretKey : seed
    const key = PrivateKey.regenerate(type, secret)
    const peer = PrivateKey.regenerate(type, type === KeyType.ED ? secret : new Uint8Array(32).fill(2))
    const publicKey = key.toPublic()
    const signature = key.signMessage(message)
    let nativeKey = null
    if (type === KeyType.R1) {
      assert.throws(() => key.toNativeString(), { message: "Unable to generate WIF for non-k1/em key" })
    } else {
      nativeKey = key.toNativeString()
    }
    assert.equal(signature.verifyMessage(message, publicKey), true)
    assert.equal(PrivateKey.from(key.toString()).toString(), key.toString())
    assert.equal(Signature.from(signature.toString()).toString(), signature.toString())
    if (type !== KeyType.ED && type !== KeyType.BLS) {
      assert.equal(signature.recoverMessage(message).toString(), publicKey.toString())
      assert.deepEqual(key.sharedSecret(peer.toPublic()).array, peer.sharedSecret(publicKey).array)
      const curve = core.Crypto.getCurve(type)
      assert.equal(PrivateKey.fromElliptic(key.toElliptic(), type).toString(), key.toString())
      assert.equal(PrivateKey.fromElliptic(key.toElliptic(), type, curve).toString(), key.toString())
    }
    return {
      type,
      nativeKey,
      privateKey: key.toString(),
      publicKey: publicKey.toString(),
      signature: signature.toString(),
      sharedSecret: type === KeyType.ED || type === KeyType.BLS
        ? null : key.sharedSecret(peer.toPublic()).toString()
    }
  })
  const hashes = [Checksum160, Checksum256, Checksum512].map(hash => hash.hash(message).toString())
  const hashConstructors = [core.Hash.sha256, core.Hash.sha384, core.Hash.sha512]
    .map(hash => hash().update(message).digest("hex"))
  const mnemonic = PrivateKey.fromMnemonic("test test test test test test test test test test test junk")
  process.stdout.write(JSON.stringify({ rows, hashes, hashConstructors,
    mnemonic: [mnemonic.address, mnemonic.private_key.toString()] }))
`

/** Execute a native consumer and surface its diagnostics if it fails. */
function runNativeChecks(script: string, ...args: string[]): string {
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", script, ...args],
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
  return result.stdout
}

describe("native curve module interoperability", () => {
  test.each(Object.values(ModuleFormat))(
    "%s preserves constructors, signatures, caches and rejected key types",
    format => {
      runNativeChecks(
        NativeCurveChecks,
        resolve(__dirname, "../../lib", format, "crypto/Curves.js"),
        format
      )
    }
  )

  test("public Core entrypoints preserve crypto results in native ESM and CJS", () => {
    const commonJs = runNativeChecks(NativeSdkChecks, ModuleFormat.cjs)
    const esModule = runNativeChecks(NativeSdkChecks, ModuleFormat.esm)
    expect(JSON.parse(esModule)).toEqual(JSON.parse(commonJs))
  })
})
