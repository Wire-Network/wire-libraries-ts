import ChildProcess from "node:child_process"
import Fs from "node:fs/promises"
import Os from "node:os"
import Path from "node:path"

import {
  CurrentDeploymentFile,
  DeploymentDataPath,
  PackagePath,
  deploymentAssetPath,
  pathExists,
  readJson,
  sha256,
  writeJson
} from "./deployment-utils.mjs"

const ContractNames = [
    "OPP",
    "OPPInbound",
    "OperatorRegistry",
    "ReserveManager"
  ],
  IdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  RevisionPattern = /^[0-9a-f]{40}$/,
  argumentsByName = parseArguments(process.argv.slice(2)),
  archive = requiredPath("archive"),
  platformManifestRevision = requiredRevision("platform-manifest-revision"),
  librariesRevision = requiredRevision("libraries-revision"),
  platformRelease = argumentsByName.get("platform-release") ?? "v1.0.0",
  standaloneManifest = argumentsByName.get("manifest"),
  replace = argumentsByName.has("replace"),
  makeCurrent = argumentsByName.has("current"),
  tempPath = await Fs.mkdtemp(Path.join(Os.tmpdir(), "sdk-outpost-import-"))

try {
  ChildProcess.execFileSync("tar", ["-xzf", archive, "-C", tempPath], {
    stdio: "ignore"
  })

  const artifactRoot = await locateArtifactRoot(tempPath),
    manifestPath = Path.join(artifactRoot, "cluster-manifest.json"),
    readmePath = Path.join(artifactRoot, "README.txt"),
    manifest = await readJson(manifestPath),
    generatedAt = await readGeneratedAt(readmePath),
    wireChainId = requiredValue(manifest, "identity.chains.wire.chain_id"),
    defaultId = `${requiredValue(manifest, "prefix")}-${generatedAt.slice(0, 10)}-${wireChainId.slice(0, 8)}`,
    id = argumentsByName.get("id") ?? defaultId

  if (!IdPattern.test(id)) {
    throw new Error(`Invalid deployment id ${id}`)
  }
  if (standaloneManifest != null) {
    const [embeddedHash, standaloneHash] = await Promise.all([
      sha256(manifestPath),
      sha256(Path.resolve(standaloneManifest))
    ])
    if (embeddedHash !== standaloneHash) {
      throw new Error("Standalone and archived cluster manifests do not match")
    }
  }

  const deploymentPath = Path.join(DeploymentDataPath, `${id}.json`)
  if ((await pathExists(deploymentPath)) && !replace) {
    throw new Error(
      `Deployment ${id} already exists; use --replace only for an intentional correction`
    )
  }

  const ethereumContracts = {},
    ethereumAssetPath = deploymentAssetPath("ethereum", id),
    solanaAssetPath = deploymentAssetPath("solana", id)

  await Fs.mkdir(ethereumAssetPath, { recursive: true })
  await Fs.mkdir(solanaAssetPath, { recursive: true })

  for (const contractName of ContractNames) {
    const sourcePath = Path.join(
        artifactRoot,
        "ethereum/runtime-abis",
        `${contractName}.json`
      ),
      expectedHash =
        manifest.identity?.evm_abis?.[`${contractName}.json`]?.sha256,
      actualHash = await sha256(sourcePath)

    if (typeof expectedHash !== "string" || actualHash !== expectedHash) {
      throw new Error(`${contractName} ABI does not match the cluster manifest`)
    }
    await Fs.copyFile(
      sourcePath,
      Path.join(ethereumAssetPath, `${contractName}.json`)
    )
    ethereumContracts[contractName] = {
      address: requiredValue(
        manifest,
        `identity.evm_contracts.${contractName}.address`
      ),
      artifactSha256: actualHash
    }
  }

  const solanaSourcePath = Path.join(
      artifactRoot,
      "solana/runtime-idls/liqsol_core.json"
    ),
    solanaHash = await sha256(solanaSourcePath),
    expectedSolanaHash = requiredValue(
      manifest,
      "identity.svm_programs.liqsol_core.idl_sha256"
    )

  if (solanaHash !== expectedSolanaHash) {
    throw new Error("liqsol_core IDL does not match the cluster manifest")
  }
  await Fs.copyFile(
    solanaSourcePath,
    Path.join(solanaAssetPath, "liqsol_core.json")
  )

  const document = {
    schemaVersion: 1,
    id,
    artifactBundle: {
      generatedAt,
      sourceArchiveSha256: await sha256(archive),
      clusterManifestSha256: await sha256(manifestPath),
      deploymentChecksum: requiredValue(manifest, "deployment_checksum"),
      snapshotChecksum: requiredValue(manifest, "snapshot_checksum"),
      platformRelease: {
        tag: platformRelease,
        url: `https://github.com/Wire-Network/wire-platform-build-system/releases/tag/${platformRelease}`,
        manifest: {
          repository: "Wire-Network/wire-platform-manifest",
          revision: platformManifestRevision
        },
        libraries: {
          repository: "Wire-Network/wire-libraries-ts",
          revision: librariesRevision
        }
      },
      sources: {
        wireTools: sourceRevision(manifest, "wire-tools-ts"),
        wireSysio: sourceRevision(manifest, "wire-sysio"),
        wireEthereum: sourceRevision(manifest, "wire-ethereum"),
        wireSolana: sourceRevision(manifest, "wire-solana")
      }
    },
    wire: { chainId: wireChainId },
    ethereum: {
      chainId: Number(requiredValue(manifest, "identity.chains.evm.chain_id")),
      contracts: ethereumContracts
    },
    solana: {
      genesisHash: requiredValue(manifest, "identity.chains.svm.genesis"),
      programs: {
        liqsolCore: {
          address: requiredValue(
            manifest,
            "identity.svm_programs.liqsol_core.program_id"
          ),
          artifactSha256: solanaHash
        }
      }
    }
  }

  await writeJson(deploymentPath, document)
  if (makeCurrent || !(await pathExists(CurrentDeploymentFile))) {
    await writeJson(CurrentDeploymentFile, { id })
  }

  for (const script of [
    "generate-deployment-catalog.mjs",
    "generate-ethereum-types.mjs",
    "generate-solana-types.mjs",
    "verify-deployments.mjs"
  ]) {
    ChildProcess.execFileSync(
      process.execPath,
      [Path.join(PackagePath, "scripts", script)],
      { stdio: "inherit" }
    )
  }

  process.stdout.write(`Imported ${id}${makeCurrent ? " as current" : ""}\n`)
} finally {
  await Fs.rm(tempPath, { force: true, recursive: true })
}

function parseArguments(values) {
  const parsed = new Map()
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (!value.startsWith("--")) {
      throw new Error(`Unexpected argument ${value}`)
    }
    const name = value.slice(2)
    if (["current", "replace"].includes(name)) {
      parsed.set(name, "true")
      continue
    }
    const next = values[index + 1]
    if (next == null || next.startsWith("--")) {
      throw new Error(`Missing value for --${name}`)
    }
    parsed.set(name, next)
    index += 1
  }
  return parsed
}

function requiredPath(name) {
  const value = argumentsByName.get(name)
  if (value == null) throw new Error(`Missing --${name}`)
  return Path.resolve(value)
}

function requiredRevision(name) {
  const value = argumentsByName.get(name)
  if (value == null || !RevisionPattern.test(value)) {
    throw new Error(`--${name} must be a full Git revision`)
  }
  return value
}

async function locateArtifactRoot(root) {
  const entries = await Fs.readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const candidate = Path.join(root, entry.name)
    if (await pathExists(Path.join(candidate, "cluster-manifest.json"))) {
      return candidate
    }
  }
  throw new Error("Archive does not contain a cluster-manifest.json")
}

async function readGeneratedAt(readmePath) {
  const readme = await Fs.readFile(readmePath, "utf8"),
    match = readme.match(/regenerated\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/)
  if (match == null)
    throw new Error("Artifact README does not record generated time")
  return match[1]
}

function requiredValue(value, path) {
  let current = value
  for (const part of path.split(".")) {
    current = current?.[part]
  }
  if (current == null || current === "") {
    throw new Error(`Cluster manifest is missing ${path}`)
  }
  return current
}

function sourceRevision(manifest, repository) {
  return {
    repository: `Wire-Network/${repository}`,
    revision: requiredValue(manifest, `identity.sources.${repository}`)
  }
}
