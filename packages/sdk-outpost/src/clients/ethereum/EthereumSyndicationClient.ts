import type {
  DepositManager,
  LiqEthToken,
  SyndicationPool
} from "@wireio/outpost-ethereum-artifacts"
import {
  computeAddress,
  getAddress,
  getBytes,
  type ContractTransactionResponse,
  type Provider,
  type Signer
} from "ethers"
import { assertEthereumSigner, ethereumProvider } from "./Connection.js"

/** Exact external-wallet balances and configured deposit/syndication limits. */
export interface EthereumSyndicationState {
  /** Spendable native ETH in wei, before gas. */
  nativeBalance: bigint
  /** External liqETH balance in token base units. */
  liquidBalance: bigint
  /** Current token allowance granted to the syndication pool. */
  allowance: bigint
  /** Liquid token decimal precision. */
  decimals: number
  /** Minimum native deposit in wei. */
  minimumDeposit: bigint
  /** Maximum liqETH base units allowed in one syndication. */
  maximumSyndication: bigint
  /** Token minting is paused. */
  depositPaused: boolean
  /** Token transfers or pool syndication are paused. */
  syndicationPaused: boolean
}
const CompressedPublicKeyLength = 33

/** User operations only; never bootstraps pools or claims Wire settlement. */
export class EthereumSyndicationClient {
  /** Construct from producer-generated contracts in a verified deployment. */
  constructor(
    /** Verified native-deposit contract. */
    readonly depositManager: DepositManager,
    /** Verified external liqETH contract. */
    readonly token: LiqEthToken,
    /** Verified syndication custody contract. */
    readonly pool: SyndicationPool,
    private readonly connection: Provider | Signer
  ) {}

  /** Read balances and verify deposit and custody use the same liquid token. */
  async read(owner: string): Promise<EthereumSyndicationState> {
    const tokenAddress = await this.token.getAddress(),
      [
        depositToken,
        poolToken,
        nativeBalance,
        liquidBalance,
        allowance,
        decimals,
        minimumDeposit,
        maximumSyndication,
        tokenPaused,
        poolPaused
      ] = await Promise.all([
        this.depositManager.liqEth(),
        this.pool.liqETH(),
        ethereumProvider(this.connection).getBalance(owner),
        this.token.balanceOf(owner),
        this.token.allowance(owner, await this.pool.getAddress()),
        this.token.decimals(),
        this.depositManager.minDeposit(),
        this.pool.maxSyndicationPerTransfer(),
        this.token.paused(),
        this.pool.paused()
      ])
    if (
      getAddress(depositToken) !== getAddress(tokenAddress) ||
      getAddress(poolToken) !== getAddress(tokenAddress)
    ) {
      throw new Error(
        "Deposit and syndication contracts do not match the verified liqETH token"
      )
    }
    return {
      nativeBalance,
      liquidBalance,
      allowance,
      decimals: Number(decimals),
      minimumDeposit,
      maximumSyndication,
      depositPaused: tokenPaused,
      syndicationPaused: tokenPaused || poolPaused
    }
  }

  /** Estimate external liqETH minted, before share rounding. */
  async quoteDeposit(amount: bigint): Promise<bigint> {
    if (amount <= 0n) throw new Error("Deposit amount must be positive")
    return (
      amount -
      ((await this.token.totalSupply()) === 0n
        ? 0n
        : await this.depositManager.procFee(amount))
    )
  }

  /** Submit one deposit; callers save the hash before waiting for confirmation. */
  async deposit(amount: bigint): Promise<ContractTransactionResponse> {
    const signer = assertEthereumSigner(this.connection, "Deposit"),
      state = await this.read(await signer.getAddress())
    if (state.depositPaused) throw new Error("Liquid staking is paused")
    if (
      amount <= 0n ||
      amount < state.minimumDeposit ||
      amount >= state.nativeBalance
    ) {
      throw new Error(
        "Deposit must meet the minimum and leave ETH for transaction fees"
      )
    }
    return this.depositManager.deposit({ value: amount })
  }

  /** Approve only the reviewed amount; no unlimited allowance. */
  async approve(amount: bigint): Promise<ContractTransactionResponse> {
    assertEthereumSigner(this.connection, "Syndication approval")
    if (amount <= 0n) throw new Error("Syndication amount must be positive")
    return this.token.approve(await this.pool.getAddress(), amount)
  }

  /** Submit measured LIQ custody with the wallet's compressed public key. */
  async syndicate(
    amount: bigint,
    compressedPublicKey: string
  ): Promise<ContractTransactionResponse> {
    const signer = assertEthereumSigner(this.connection, "Syndication"),
      owner = await signer.getAddress(),
      state = await this.read(owner)
    if (
      getBytes(compressedPublicKey).length !== CompressedPublicKeyLength ||
      getAddress(computeAddress(compressedPublicKey)) !== getAddress(owner)
    ) {
      throw new Error(
        "Syndication public key does not match the signing wallet"
      )
    }
    if (state.syndicationPaused) throw new Error("Syndication is paused")
    if (
      amount <= 0n ||
      amount > state.liquidBalance ||
      amount > state.maximumSyndication
    ) {
      throw new Error(
        "Syndication exceeds the wallet balance or configured limit"
      )
    }
    if (state.allowance < amount)
      throw new Error("Approve the reviewed liqETH amount before syndicating")
    return this.pool.syndicate(amount, compressedPublicKey)
  }
}
