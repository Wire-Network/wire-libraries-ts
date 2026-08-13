// noinspection JSUnresolvedReference

/**
 * pnpm hook to resolve @wireio packages from the local wire-libraries-ts monorepo.
 *
 * Usage:
 *   1. Build the wire-sysio and outpost producer outputs in the sibling repos.
 *   2. Run `pnpm install --lockfile=false` to consume those local outputs.
 *   3. Remove the sibling outputs to exercise registry-only release resolution.
 *
 * Docs: https://pnpm.io/pnpmfile
 */

const Path = require("path")
const Fs = require("node:fs")

const localOppModelTargets = ["typescript", "solidity"]
const localOutpostArtifactPackages = [
  [
    "@wireio/outpost-ethereum-artifacts",
    Path.resolve(
      __dirname,
      "..",
      "wire-ethereum",
      "build",
      "sdk-artifacts"
    )
  ],
  [
    "@wireio/outpost-solana-artifacts",
    Path.resolve(
      __dirname,
      "..",
      "wire-solana",
      "build",
      "sdk-artifacts"
    )
  ]
]

/**
 * Checks whether a path exists and is a directory, without throwing.
 *
 * @param {string} dirPath
 * @returns {boolean}
 */
function isDirectory(dirPath) {
  try {
    return Fs.lstatSync(dirPath).isDirectory()
  } catch {
    return false
  }
}

/**
 * Map of package names to their local directory in wire-libraries-ts.
 * Uncomment the entries you want to link locally.
 */
const localOverrides = {}

/**
 * Appends every locally available source-owned producer package.
 *
 * Platform builds consume sibling outputs automatically after their producers
 * run. Registry-only release verification runs without those sibling outputs.
 */
function appendLocalProducerOverrides() {
  localOppModelTargets
    .map(target => [
      `@wireio/opp-${target}-models`,
      Path.resolve(__dirname, "..", "wire-sysio", "build", "opp", target)
    ])
    .concat(localOutpostArtifactPackages)
    .filter(([, path]) => isDirectory(path))
    .forEach(([pkgName, path]) => {
      localOverrides[pkgName] = path
    })
}

appendLocalProducerOverrides()

/**
 * `readPackage` hook, which links locally available versions of
 * shared libraries and models.
 *
 * @param pkg
 * @param context
 * @returns {*}
 */
function readPackage(pkg, context) {
  for (const [name, localPath] of Object.entries(localOverrides)) {
    if (pkg.dependencies && pkg.dependencies[name]) {
      pkg.dependencies[name] = `link:${localPath}`
      context.log(`Linked ${name} -> ${localPath}`)
    }
    if (pkg.devDependencies && pkg.devDependencies[name]) {
      pkg.devDependencies[name] = `link:${localPath}`
      context.log(`Linked ${name} -> ${localPath}`)
    }
  }
  return pkg
}

module.exports = {
  hooks: {
    readPackage
  }
}
