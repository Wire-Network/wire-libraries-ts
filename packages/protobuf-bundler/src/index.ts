import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { log, setLogLevel } from "./util/logger.js"
import { bundleCommand } from "./commands/bundle.js"

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("protobuf-bundler")
    .usage(
      "$0 --repo <repo> --target <target> --output <dir> --package-name <name>"
    )
    .option("repo", {
      type: "string",
      demandOption: true,
      describe:
        "GitHub repo spec '<owner/repo>[/<subfolder>][#<branch>]' or local path 'file://<path>'"
    })
    .option("target", {
      type: "string",
      demandOption: true,
      choices: ["solana", "solidity"] as const,
      describe: "Code generation target"
    })
    .option("output", {
      type: "string",
      demandOption: true,
      describe: "Output directory for the generated package"
    })
    .option("package-name", {
      type: "string",
      demandOption: true,
      describe: "Name for the generated package"
    })
    .option("package-version", {
      type: "string",
      demandOption: true,
      describe: "Semver version for the generated package"
    })
    .option("package-data", {
      type: "string",
      default: "{}",
      describe:
        "Additional package metadata (JSON for solidity, TOML for solana)"
    })
    .option("verbose", {
      type: "boolean",
      default: false,
      describe: "Enable debug logging"
    })
    .example(
      "$0 --repo 'Wire-Network/wire-sysio/libraries/opp#feature/protobuf-support-for-opp' --target solana --output build/generated/solana --package-name wire-opp-solana-models",
      "Generate a Rust crate from proto files"
    )
    .example(
      "$0 --repo 'Wire-Network/wire-sysio/libraries/opp#feature/protobuf-support-for-opp' --target solidity --output build/generated/solidity --package-name @wireio/opp-solidity-models",
      "Generate an npm package from proto files"
    )
    .strict()
    .help()
    .parse()

  if (argv.verbose) {
    setLogLevel("debug")
  }

  log.info("protobuf-bundler starting")

  let packageData: Record<string, any> = {}
  try {
    packageData = JSON.parse(argv.packageData)
  } catch (err: any) {
    log.error("Invalid --package-data JSON: %s", err.message)
    process.exit(1)
  }

  await bundleCommand({
    repo: argv.repo,
    target: argv.target as "solana" | "solidity",
    output: argv.output,
    packageName: argv.packageName,
    packageVersion: argv.packageVersion,
    packageData
  })
}

main().catch(err => {
  log.error("Fatal: %s", err.message)
  process.exit(1)
})
