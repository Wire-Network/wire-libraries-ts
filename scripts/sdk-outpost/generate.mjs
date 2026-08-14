#!/usr/bin/env node

/**
 * Generate sdk-outpost clients and manifests from canonical producer artifacts.
 *
 * Usage:
 *   ./scripts/sdk-outpost/generate.mjs
 *
 * Options:
 *   None.
 *
 * Examples:
 *   ./scripts/sdk-outpost/generate.mjs
 *
 * Exit codes:
 *   0 on success; nonzero when artifact validation or generation fails.
 */

import Crypto from "node:crypto"
import { createRequire } from "node:module"

import { format } from "prettier"
import { $, fs, path } from "zx"

import {
  EthereumArtifactPackageName,
  PackageManifestPath,
  PackagePath,
  SolanaArtifactPackageName,
  assert,
  readJson
} from "./config.mjs"

const PackageRequire = createRequire(PackageManifestPath),
  EthereumOutputPath = path.join(
    PackagePath,
    "src/contracts/ethereum/generated"
  ),
  SolanaOutputPath = path.join(PackagePath, "src/programs/solana/generated"),
  ArtifactOutputPath = path.join(PackagePath, "src/artifacts/generated"),
  EthereumContractNames = [
    "OPP",
    "OPPInbound",
    "OperatorRegistry",
    "ReserveManager"
  ],
  SolanaProgramName = "liqsolCore",
  TypechainPath = path.join(PackagePath, "node_modules/.bin/typechain"),
  EmptyRuntimeLinkReferencesJson = '"runtimeLinkReferences": []',
  TypedEmptyRuntimeLinkReferencesSource =
    '"runtimeLinkReferences": [] as never[]'

assert(
  process.argv.length === 2,
  "sdk-outpost generation does not accept command-line options"
)

/** Resolve one exported file from a source-owned artifact package. */
function resolveArtifact(packageName, artifactPath) {
  return PackageRequire.resolve(`${packageName}/${artifactPath}`)
}

/** Return the SHA-256 digest for generated artifact bytes. */
function sha256(value) {
  return Crypto.createHash("sha256").update(value).digest("hex")
}

/** Serialize one ABI exactly as its producer computes the interface digest. */
function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

/** Verify one package-owned artifact before it can generate SDK code. */
function assertArtifactDigest(actual, expected, label) {
  assert(actual === expected, `${label} checksum mismatch`)
}

/** Format generated TypeScript according to repository rules. */
async function formatTypescript(source) {
  return format(source, {
    parser: "typescript",
    semi: false,
    singleQuote: false,
    trailingComma: "none"
  })
}

/** Resolve and verify the canonical producer-package generation inputs. */
async function resolveGenerationInput() {
  const EthereumManifestPath = PackageRequire.resolve(
      `${EthereumArtifactPackageName}/manifest.json`
    ),
    SolanaManifestPath = PackageRequire.resolve(
      `${SolanaArtifactPackageName}/manifest.json`
    ),
    [packageManifest, ethereumManifest, solanaManifest] = await Promise.all([
      readJson(PackageManifestPath),
      readJson(EthereumManifestPath),
      readJson(SolanaManifestPath)
    ])

  assert(
    ethereumManifest.package.name === EthereumArtifactPackageName,
    `Unexpected Ethereum artifact package ${ethereumManifest.package.name}`
  )
  assert(
    solanaManifest.package.name === SolanaArtifactPackageName,
    `Unexpected Solana artifact package ${solanaManifest.package.name}`
  )
  assert(
    packageManifest.devDependencies[EthereumArtifactPackageName] ===
      ethereumManifest.package.version,
    `Ethereum artifact version ${ethereumManifest.package.version} does not match sdk-outpost`
  )
  assert(
    packageManifest.devDependencies[SolanaArtifactPackageName] ===
      solanaManifest.package.version,
    `Solana artifact version ${solanaManifest.package.version} does not match sdk-outpost`
  )
  assert(
    EthereumContractNames.every(
      name => ethereumManifest.contracts[name] != null
    ),
    "Ethereum artifact package does not cover the sdk-outpost contract surface"
  )
  assert(
    solanaManifest.programs[SolanaProgramName] != null,
    "Solana artifact package does not cover liqsol_core"
  )

  const ethereumAbiPaths = await Promise.all(
      EthereumContractNames.map(async name => {
        const contract = ethereumManifest.contracts[name],
          abiPath = resolveArtifact(EthereumArtifactPackageName, contract.path),
          runtimeBytecodePath = resolveArtifact(
            EthereumArtifactPackageName,
            contract.runtimeBytecodePath
          ),
          [artifact, runtimeBytecode] = await Promise.all([
            readJson(abiPath),
            fs.readFile(runtimeBytecodePath)
          ])

        assertArtifactDigest(
          sha256(formatJson(artifact.abi)),
          contract.abiSha256,
          `Ethereum ${name} ABI`
        )
        assert(
          runtimeBytecode.length === contract.runtimeBytecodeLength,
          `Ethereum ${name} runtime bytecode length mismatch`
        )
        assertArtifactDigest(
          sha256(runtimeBytecode),
          contract.runtimeBytecodeSha256,
          `Ethereum ${name} runtime bytecode`
        )
        return abiPath
      })
    ),
    solanaProgram = solanaManifest.programs[SolanaProgramName],
    solanaIdlPath = resolveArtifact(
      SolanaArtifactPackageName,
      solanaProgram.idlPath
    ),
    solanaProgramBinaryPath = resolveArtifact(
      SolanaArtifactPackageName,
      solanaProgram.programBinaryPath
    ),
    [rawIdlSource, solanaProgramBinary] = await Promise.all([
      fs.readFile(solanaIdlPath),
      fs.readFile(solanaProgramBinaryPath)
    ])

  assertArtifactDigest(
    sha256(rawIdlSource),
    solanaProgram.idlSha256,
    "Solana liqsolCore IDL"
  )
  assert(
    solanaProgramBinary.length === solanaProgram.programBinaryLength,
    "Solana liqsolCore program binary length mismatch"
  )
  assertArtifactDigest(
    sha256(solanaProgramBinary),
    solanaProgram.programBinarySha256,
    "Solana liqsolCore program binary"
  )

  return {
    ethereumManifest,
    solanaManifest,
    ethereumAbiPaths,
    solanaIdlPath
  }
}

const generationInput = await resolveGenerationInput()

await Promise.all(
  [EthereumOutputPath, SolanaOutputPath, ArtifactOutputPath].map(outputPath =>
    fs.rm(outputPath, { force: true, recursive: true })
  )
)
await Promise.all(
  [SolanaOutputPath, ArtifactOutputPath].map(outputPath =>
    fs.mkdir(outputPath, { recursive: true })
  )
)

await $({
  cwd: PackagePath
})`${TypechainPath} --target ethers-v5 --node16-modules --out-dir ${EthereumOutputPath} ${generationInput.ethereumAbiPaths}`

const { convertIdlToCamelCase } = PackageRequire(
    "@coral-xyz/anchor/dist/cjs/idl.js"
  ),
  rawIdlSource = await fs.readFile(generationInput.solanaIdlPath),
  rawIdl = JSON.parse(rawIdlSource.toString("utf8")),
  idl = convertIdlToCamelCase(rawIdl),
  ethereumManifestSource = JSON.stringify(
    generationInput.ethereumManifest,
    null,
    2
  ).replaceAll(
    EmptyRuntimeLinkReferencesJson,
    TypedEmptyRuntimeLinkReferencesSource
  ),
  solanaSource = await formatTypescript(`
    /* Autogenerated file. Do not edit manually. */
    /* eslint-disable */
    import type { Idl } from "@coral-xyz/anchor"

    /** Remove readonly modifiers while preserving the generated IDL's literal names. */
    type MutableIdl<T> = T extends object
      ? { -readonly [Key in keyof T]: MutableIdl<T[Key]> }
      : T

    /** Capture a precise mutable IDL type for Anchor's generated namespaces. */
    function mutableIdl<const T extends Idl>(value: T): MutableIdl<T> {
      return value as MutableIdl<T>
    }

    const liqsolCoreIdlValue = mutableIdl(${JSON.stringify(idl, null, 2)})

    /** Strict Anchor IDL type generated from the selected artifact input. */
    export type LiqsolCore = typeof liqsolCoreIdlValue

    /** Camel-cased liqsol_core IDL consumed by Anchor's typed Program client. */
    export const liqsolCoreIdl = liqsolCoreIdlValue
  `),
  artifactSource = await formatTypescript(`
    /* Autogenerated file. Do not edit manually. */
    /* eslint-disable */

    /** Exact npm artifact inputs compiled into this SDK build. */
    export const OutpostArtifactManifests = {
      ethereum: ${ethereumManifestSource},
      solana: ${JSON.stringify(generationInput.solanaManifest, null, 2)}
    }
  `)

await Promise.all([
  fs.writeFile(path.join(SolanaOutputPath, "LiqsolCore.ts"), solanaSource),
  fs.writeFile(
    path.join(SolanaOutputPath, "index.ts"),
    'export * from "./LiqsolCore.js"\n'
  ),
  fs.writeFile(path.join(ArtifactOutputPath, "Manifests.ts"), artifactSource),
  fs.writeFile(
    path.join(ArtifactOutputPath, "index.ts"),
    'export * from "./Manifests.js"\n'
  )
])

process.stdout.write(
  `Generated sdk-outpost clients from npm artifacts ${generationInput.ethereumManifest.source.revision} and ${generationInput.solanaManifest.source.revision}\n`
)
