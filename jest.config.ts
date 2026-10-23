import type { Config } from "jest"

const config: Config = {
  projects: [
    "packages/shared",
    "packages/shared-node",
    "packages/shared-web",
    "packages/sdk-core",
    "packages/sdk-outpost",
    "packages/opp-snapshot",
    "packages/wallet-browser-ext",
    "packages/wallet-ext-sdk"
  ]
}

export default config
