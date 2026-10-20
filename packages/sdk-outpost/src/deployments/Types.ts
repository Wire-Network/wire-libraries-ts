/** Supported external-chain client families. */
export enum OutpostChainFamily {
  ethereum = "ethereum",
  solana = "solana"
}

/** Ethereum contracts owned by the current outpost deployment. */
export enum EthereumContractName {
  BAR = "BAR",
  WithdrawalQueue = "WithdrawalQueue",
  WithdrawalQueueV2 = "WithdrawalQueueV2",
  DepositManagerV3 = "DepositManagerV3",
  LiqEthTokenV4 = "LiqEthTokenV4",
  DepositManager = "DepositManager",
  LiqEthToken = "LiqEthToken",
  SyndicationPool = "SyndicationPool",
  OPP = "OPP",
  OPPInbound = "OPPInbound"
}

/** Solana programs owned by the current outpost deployment. */
export enum SolanaProgramName {
  liqsolCore = "liqsolCore"
}
