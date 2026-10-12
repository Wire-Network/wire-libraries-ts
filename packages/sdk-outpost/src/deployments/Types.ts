/** Supported external-chain client families. */
export enum OutpostChainFamily {
  ethereum = "ethereum",
  solana = "solana"
}

/** Ethereum contracts owned by the current outpost deployment. */
export enum EthereumContractName {
  BAR = "BAR",
  OPP = "OPP",
  OPPInbound = "OPPInbound"
}

/** Solana programs owned by the current outpost deployment. */
export enum SolanaProgramName {
  liqsolCore = "liqsolCore"
}
