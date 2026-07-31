/** Supported external-chain client families. */
export enum OutpostChainFamily {
  ethereum = "ethereum",
  solana = "solana"
}

/** Versioned deployment bundles shipped by the SDK. */
export enum OutpostDeploymentId {
  sim2 = "sim2"
}

/** Ethereum contracts owned by the current outpost deployment. */
export enum EthereumContractName {
  OPP = "OPP",
  OPPInbound = "OPPInbound",
  OperatorRegistry = "OperatorRegistry",
  ReserveManager = "ReserveManager"
}

/** Solana programs owned by the current outpost deployment. */
export enum SolanaProgramName {
  liqsolCore = "liqsolCore"
}
