#!/usr/bin/env zx

import Crypto from "node:crypto"
import Os from "node:os"
import { createRequire } from "node:module"

import { format } from "prettier"
import { $, argv, fs, path } from "zx"

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
  DeploymentProfileFilename = "outpost-deployment-profile.json",
  ClusterManifestFilename = "cluster-manifest.json",
  DeploymentBundleDirectoryName = "sim2-artifacts",
  DeploymentArtifactsPath = argv["deployment-artifacts-path"],
  DevelopmentPackageVersion = "0.0.0-development",
  EmptyArtifactPath = "",
  EmptyArtifactDigest = "",
  EmptyArtifactLength = 0,
  Sha256Pattern = /^[0-9a-f]{64}$/,
  EmptyRuntimeLinkReferencesJson = '"runtimeLinkReferences": []',
  TypedEmptyRuntimeLinkReferencesSource =
    '"runtimeLinkReferences": [] as never[]',
  ArtifactMode = {
    sourcePackage: "sourcePackage",
    deploymentBundle: "deploymentBundle"
  }

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

/** Verify that a deployment profile contains one lowercase SHA-256 digest. */
function assertSha256(value, label) {
  assert(
    typeof value === "string" && Sha256Pattern.test(value),
    `${label} must be a lowercase SHA-256 digest`
  )
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

/** Add deployment-only hash slots to one canonical Ethereum manifest. */
function createSourceEthereumManifest(manifest) {
  return {
    ...manifest,
    contracts: Object.fromEntries(
      Object.entries(manifest.contracts).map(([name, contract]) => [
        name,
        { ...contract, implementationCodeSha256: EmptyArtifactDigest }
      ])
    )
  }
}

/** Add deployment-only hash slots to one canonical Solana manifest. */
function createSourceSolanaManifest(manifest) {
  return {
    ...manifest,
    programs: Object.fromEntries(
      Object.entries(manifest.programs).map(([name, program]) => [
        name,
        { ...program, programDataSha256: EmptyArtifactDigest }
      ])
    )
  }
}

/** Resolve and verify the canonical producer-package generation inputs. */
async function resolveSourceGenerationInput() {
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
    mode: ArtifactMode.sourcePackage,
    deploymentProfileId: EmptyArtifactDigest,
    ethereumManifest: createSourceEthereumManifest(ethereumManifest),
    solanaManifest: createSourceSolanaManifest(solanaManifest),
    ethereumAbiPaths,
    solanaIdlPath,
    cleanupPath: null
  }
}

/** Locate an extracted deployment bundle beneath one candidate directory. */
function findDeploymentBundleRoot(candidatePath) {
  return [
    candidatePath,
    path.join(candidatePath, DeploymentBundleDirectoryName)
  ].find(bundlePath =>
    fs.existsSync(path.join(bundlePath, DeploymentProfileFilename))
  )
}

/** Resolve a deployment directory or extract a supplied tar.gz archive. */
async function resolveDeploymentBundleRoot(inputPath) {
  const resolvedPath = path.resolve(String(inputPath)),
    inputStat = await fs.stat(resolvedPath)

  if (inputStat.isDirectory()) {
    const bundlePath = findDeploymentBundleRoot(resolvedPath)
    assert(
      bundlePath != null,
      `Deployment bundle is missing beneath ${resolvedPath}`
    )
    return { bundlePath, cleanupPath: null }
  }

  const cleanupPath = await fs.mkdtemp(
    path.join(Os.tmpdir(), "wire-sdk-outpost-deployment-")
  )
  try {
    await $`tar -xzf ${resolvedPath} -C ${cleanupPath}`
    const bundlePath = findDeploymentBundleRoot(cleanupPath)
    assert(
      bundlePath != null,
      `Archive ${resolvedPath} is not a deployment bundle`
    )
    return { bundlePath, cleanupPath }
  } catch (error) {
    await fs.rm(cleanupPath, { force: true, recursive: true })
    throw error
  }
}

/** Resolve and verify one exact deployment-bundle generation input. */
async function resolveDeploymentGenerationInput(inputPath) {
  const { bundlePath, cleanupPath } =
    await resolveDeploymentBundleRoot(inputPath)

  try {
    const profilePath = path.join(bundlePath, DeploymentProfileFilename),
      clusterManifestPath = path.join(bundlePath, ClusterManifestFilename),
      [profile, clusterManifest] = await Promise.all([
        readJson(profilePath),
        readJson(clusterManifestPath)
      ])

    assert(profile.schemaVersion === 1, "Unsupported deployment profile schema")
    assertSha256(profile.deploymentChecksum, "Deployment profile checksum")
    assert(
      profile.id ===
        `${profile.wire?.chainId}-${profile.deploymentChecksum.slice(0, 12)}`,
      "Deployment profile id does not match its Wire chain and checksum"
    )
    assert(
      profile.wire.chainId === clusterManifest.identity?.chains?.wire?.chain_id,
      "Deployment bundle Wire chain identity mismatch"
    )
    assert(
      profile.ethereum?.chainId ===
        clusterManifest.identity?.chains?.evm?.chain_id,
      "Deployment bundle Ethereum chain identity mismatch"
    )
    assert(
      profile.solana?.genesisHash ===
        clusterManifest.identity?.chains?.svm?.genesis,
      "Deployment bundle Solana chain identity mismatch"
    )

    const ethereumAbiPaths = await Promise.all(
        EthereumContractNames.map(async name => {
          const abiPath = path.join(
              bundlePath,
              "ethereum",
              "runtime-abis",
              `${name}.json`
            ),
            artifact = await readJson(abiPath),
            contract = profile.ethereum?.contracts?.[name]

          assert(
            contract != null,
            `Deployment profile is missing Ethereum ${name}`
          )
          assertSha256(contract.abiSha256, `Ethereum ${name} ABI hash`)
          assertSha256(
            contract.implementationCodeSha256,
            `Ethereum ${name} implementation hash`
          )
          assert(
            artifact.contractName === name && Array.isArray(artifact.abi),
            `Deployment bundle has an invalid Ethereum ${name} ABI`
          )
          assertArtifactDigest(
            sha256(formatJson(artifact.abi)),
            contract.abiSha256,
            `Ethereum ${name} ABI`
          )
          return abiPath
        })
      ),
      solanaIdlPath = path.join(
        bundlePath,
        "solana",
        "runtime-idls",
        "liqsol_core.json"
      ),
      rawIdlSource = await fs.readFile(solanaIdlPath),
      solanaProgram = profile.solana?.programs?.[SolanaProgramName]

    assert(solanaProgram != null, "Deployment profile is missing liqsolCore")
    assertSha256(solanaProgram.idlSha256, "Solana liqsolCore IDL hash")
    assertSha256(
      solanaProgram.programDataSha256,
      "Solana liqsolCore ProgramData hash"
    )
    assertArtifactDigest(
      sha256(rawIdlSource),
      solanaProgram.idlSha256,
      "Solana liqsolCore IDL"
    )

    const ethereumManifest = {
        schemaVersion: 1,
        package: {
          name: EthereumArtifactPackageName,
          version: DevelopmentPackageVersion
        },
        source: {
          repository: "Wire-Network/wire-ethereum",
          revision: clusterManifest.identity.sources["wire-ethereum"]
        },
        contracts: Object.fromEntries(
          EthereumContractNames.map(name => {
            const contract = profile.ethereum.contracts[name]
            return [
              name,
              {
                path: `ethereum/runtime-abis/${name}.json`,
                abiSha256: contract.abiSha256,
                runtimeBytecodePath: EmptyArtifactPath,
                runtimeBytecodeLength: EmptyArtifactLength,
                runtimeBytecodeSha256: EmptyArtifactDigest,
                runtimeLinkReferences: [],
                implementationCodeSha256: contract.implementationCodeSha256
              }
            ]
          })
        )
      },
      solanaManifest = {
        schemaVersion: 1,
        package: {
          name: SolanaArtifactPackageName,
          version: DevelopmentPackageVersion
        },
        source: {
          repository: "Wire-Network/wire-solana",
          revision: clusterManifest.identity.sources["wire-solana"]
        },
        toolchain: clusterManifest.identity.chains.svm.version,
        programs: {
          [SolanaProgramName]: {
            idlPath: "solana/runtime-idls/liqsol_core.json",
            idlSha256: solanaProgram.idlSha256,
            programBinaryPath: EmptyArtifactPath,
            programBinaryLength: EmptyArtifactLength,
            programBinarySha256: EmptyArtifactDigest,
            programDataSha256: solanaProgram.programDataSha256
          }
        }
      }

    return {
      mode: ArtifactMode.deploymentBundle,
      deploymentProfileId: profile.id,
      ethereumManifest,
      solanaManifest,
      ethereumAbiPaths,
      solanaIdlPath,
      cleanupPath
    }
  } catch (error) {
    if (cleanupPath != null) {
      await fs.rm(cleanupPath, { force: true, recursive: true })
    }
    throw error
  }
}

/** Resolve the selected canonical or local deployment generation input. */
async function resolveGenerationInput() {
  if (DeploymentArtifactsPath == null) return resolveSourceGenerationInput()
  return resolveDeploymentGenerationInput(DeploymentArtifactsPath)
}

const generationInput = await resolveGenerationInput()

try {
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

      import { OutpostArtifactMode } from "../Mode.js"

      /** Exact artifact input compiled into this SDK build. */
      export const OutpostArtifactManifests = {
        mode: OutpostArtifactMode.${generationInput.mode},
        deploymentProfileId: ${JSON.stringify(
          generationInput.deploymentProfileId
        )},
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
    `Generated sdk-outpost clients in ${generationInput.mode} mode from ${generationInput.ethereumManifest.source.revision} and ${generationInput.solanaManifest.source.revision}\n`
  )
} finally {
  if (generationInput.cleanupPath != null) {
    await fs.rm(generationInput.cleanupPath, { force: true, recursive: true })
  }
}
