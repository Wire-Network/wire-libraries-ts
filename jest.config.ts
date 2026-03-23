import type { Config } from "jest"

const config: Config = {
  projects: [
    "packages/shared",
    "packages/shared-node",
    "packages/shared-web",
    "packages/sdk-core",
    "packages/wallet-browser-ext",
    "packages/wallet-ext-sdk",
    "packages/protoc-gen-solana",
    "packages/protoc-gen-solidity",
    "packages/protobuf-bundler"
  ]
}

export default config
