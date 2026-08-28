// noinspection JSUnresolvedReference

/**
 * pnpm hook to resolve @wireio packages from the local wire-libraries-ts monorepo.
 *
 * Usage:
 *   1. Build any supported sibling package outputs you want to use locally.
 *   2. Run `pnpm install --lockfile=false` to consume available local packages.
 *   3. Remove those outputs to resolve packages from the registry again.
 *
 * Docs: https://pnpm.io/pnpmfile
 */

const Path = require("path")
const Fs = require("node:fs")

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

/** Map of locally available packages keyed by package name. */
const localOverrides = {}

// AS THE PROTOBUF LIBS HAVE BEEN RELOCATED TO SYSIO
// WE CAN NOW USE THE MODELS WITHOUT ISSUE.
// CIRCULAR DEP REMOVED

const wireOPPPkgPaths = ["typescript", "solidity"].map(target => [
  `@wireio/opp-${target}-models`,
  Path.resolve(__dirname, "..", "wire-sysio", "build", "opp", target)
])

const outpostArtifactPkgPaths = [
  [
    "@wireio/outpost-ethereum-artifacts",
    Path.resolve(__dirname, "..", "wire-ethereum", "build", "sdk-artifacts")
  ],
  [
    "@wireio/outpost-solana-artifacts",
    Path.resolve(__dirname, "..", "wire-solana", "build", "sdk-artifacts")
  ]
]

wireOPPPkgPaths
  .concat(outpostArtifactPkgPaths)
  .filter(([, path]) => isDirectory(path))
  .forEach(([pkgName, path]) => {
    localOverrides[pkgName] = path
  })

/**
 * `readPackage` hook, which links locally available packages.
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
