// noinspection JSUnresolvedReference

/**
 * pnpm hook to resolve OPP model packages from a local wire-sysio build.
 *
 * Usage:
 *   1. Build the wire-sysio OPP model outputs in the sibling repo.
 *   2. Run `WIRE_USE_LOCAL_OPP_MODELS=true pnpm install --lockfile=false`.
 *
 * Registry resolution is the default. Outpost artifact packages always resolve
 * from their exact registry versions.
 *
 * Docs: https://pnpm.io/pnpmfile
 */

const Path = require("path")
const Fs = require("node:fs")

const LOCAL_OPP_MODELS_ENABLED = "true"
const localOppModelTargets = ["typescript", "solidity"]

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
 * Appends every locally available OPP model package.
 *
 * Platform builds may consume wire-sysio model output after its producer runs.
 */
function appendLocalOppModelOverrides() {
  localOppModelTargets
    .map(target => [
      `@wireio/opp-${target}-models`,
      Path.resolve(__dirname, "..", "wire-sysio", "build", "opp", target)
    ])
    .filter(([, path]) => isDirectory(path))
    .forEach(([pkgName, path]) => {
      localOverrides[pkgName] = path
    })
}

if (process.env.WIRE_USE_LOCAL_OPP_MODELS === LOCAL_OPP_MODELS_ENABLED) {
  appendLocalOppModelOverrides()
}

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
