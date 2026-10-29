import { SolanaSeeds as Seed, solanaProgramAddress } from "./Addresses.js"
import { BN } from "@coral-xyz/anchor"
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  unpackAccount
} from "@solana/spl-token"
import {
  ComputeBudgetProgram,
  PublicKey,
  StakeProgram,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_STAKE_HISTORY_PUBKEY
} from "@solana/web3.js"
import { SlugName } from "@wireio/sdk-core"
import type { SolanaCoreProgram } from "./Types.js"
import type { OutpostDeploymentProfile } from "../../deployments/index.js"

const DepositComputeUnitLimit = 1_000_000,
  SyndicationComputeUnitLimit = 800_000,
  DepositsEnabled = 1,
  LiquidDecimals = 9,
  MinimumPositiveAmount = 1n,
  EphemeralStakePrefix = "ephemeral_",
  MaximumSeed = 0xffffffff,
  DepositPayRateCount = 5,
  DepositFeeScale = 1_000_000_000_000n,
  MaximumTokenAmount = (1n << 64n) - 1n,
  MaximumFeeNumerator = (1n << 128n) - 1n,
  LiquidTokenCode = BigInt(SlugName.from("LIQSOL"))

/** Native deposit cost in lamports; transaction fees and account rent are additional. */
export interface SolanaDepositQuote {
  /** Requested liqSOL amount, minted one-for-one before share rounding. */
  amount: bigint
  /** Protocol fee charged in SOL on top of the requested amount. */
  fee: bigint
  /** Requested amount plus the protocol fee. */
  totalDebit: bigint
}

/** Deployed companion programs selected alongside the verified core program. */
export type SolanaLiqsolDeployment = NonNullable<
  OutpostDeploymentProfile["solana"]["liqsol"]
>

/** Wallet funds and on-chain admission gates; no readiness is inferred from an RPC URL. */
export interface SolanaSyndicationState {
  /** Native SOL balance in lamports, before fees and rent. */
  nativeBalance: bigint
  /** External liqSOL balance in token base units. */
  liquidBalance: bigint
  /** Liquid token decimal precision. */
  decimals: number
  /** Minimum native deposit in lamports. */
  minimumDeposit: bigint
  /** Minimum liqSOL base units; legacy Testnet requires only a positive amount. */
  minimumSyndication: bigint
  /** Maximum liqSOL base units allowed in one syndication. */
  maximumSyndication: bigint
  /** Native deposits are enabled by the core feature flag. */
  depositEnabled: boolean
  /** OPP syndication is in PostLaunch mode. */
  postLaunch: boolean
  /** OPP has the exact liqSOL mint and decimal precision. */
  mapped: boolean
  /** The core is paused or frozen. */
  paused: boolean
}

/** Core-owned PDA seeds shared by deposit and PostLaunch syndication. */

/** Browser-safe transaction construction for the current liqsol-core contract. */
export class SolanaSyndicationClient {
  /** Accept the verified core and explicit companion identities; no private keys or admin actions. */
  constructor(
    /** Producer-generated client for the verified core program. */
    readonly program: SolanaCoreProgram,
    private readonly deployment: SolanaLiqsolDeployment
  ) {}

  private coreAddress(seed: string, ...rest: Buffer[]): PublicKey {
    return solanaProgramAddress(this.program.programId, seed, ...rest)
  }

  /** Derive the canonical Token-2022 and core account set for a wallet. */
  addresses(user: PublicKey) {
    const liqsolProgram = new PublicKey(this.deployment.tokenProgramAddress),
      transferHookProgram = new PublicKey(
        this.deployment.transferHookProgramAddress
      ),
      core = this.coreAddress.bind(this),
      liqsolMint = PublicKey.findProgramAddressSync(
        [Buffer.from(Seed.liqsolMint)],
        liqsolProgram
      )[0],
      poolAuthority = core(Seed.poolAuthority),
      bucketAuthority = core(Seed.bucketAuthority),
      userAta = getAssociatedTokenAddressSync(
        liqsolMint,
        user,
        false,
        TOKEN_2022_PROGRAM_ID
      ),
      liqsolPoolAta = getAssociatedTokenAddressSync(
        liqsolMint,
        poolAuthority,
        true,
        TOKEN_2022_PROGRAM_ID
      ),
      bucketTokenAccount = getAssociatedTokenAddressSync(
        liqsolMint,
        bucketAuthority,
        true,
        TOKEN_2022_PROGRAM_ID
      )
    return {
      user,
      userAta,
      liqsolProgram,
      transferHookProgram,
      liqsolMint,
      poolAuthority,
      bucketAuthority,
      liqsolPoolAta,
      bucketTokenAccount,
      globalState: core(Seed.globalState),
      globalConfig: core(Seed.globalConfig),
      distributionState: core(Seed.distributionState),
      depositAuthority: core(Seed.depositAuthority),
      payRateHistory: core(Seed.payRateHistory),
      reservePool: core(Seed.reservePool),
      vault: core(Seed.vault),
      controllerState: core(Seed.controllerState),
      payoutState: core(Seed.payoutState),
      config: core(Seed.config),
      outboundMessageBuffer: core(Seed.outboundMessageBuffer),
      liqsolMintAuthority: PublicKey.findProgramAddressSync(
        [Buffer.from(Seed.mintAuthority)],
        liqsolProgram
      )[0],
      userRecord: core(Seed.userRecord, userAta.toBuffer()),
      bucketUserRecord: core(Seed.userRecord, bucketTokenAccount.toBuffer()),
      receiverUserRecord: core(Seed.userRecord, liqsolPoolAta.toBuffer()),
      extraAccountMetaList: PublicKey.findProgramAddressSync(
        [Buffer.from(Seed.extraAccountMetaList), liqsolMint.toBuffer()],
        transferHookProgram
      )[0]
    }
  }

  /** Read exact balances and launch/mint/precision gates without submitting anything. */
  async read(user: PublicKey): Promise<SolanaSyndicationState> {
    const addresses = this.addresses(user),
      connection = this.program.provider.connection,
      [
        config,
        state,
        outpost,
        distribution,
        account,
        nativeBalance,
        companions
      ] = await Promise.all([
        this.program.account.globalConfig.fetch(addresses.globalConfig),
        this.program.account.globalState.fetch(addresses.globalState),
        this.program.account.outpostConfig.fetch(addresses.config),
        this.program.account.distributionState.fetch(
          addresses.distributionState
        ),
        connection.getAccountInfo(addresses.userAta),
        connection.getBalance(user),
        connection.getMultipleAccountsInfo([
          addresses.liqsolProgram,
          addresses.transferHookProgram
        ])
      ])
    if (
      companions.some(program => !program?.executable) ||
      !distribution.liqsolMint.equals(addresses.liqsolMint)
    ) {
      throw new Error(
        "The deployed liqSOL mint or companion programs do not match the deployment profile"
      )
    }
    const mapped =
      outpost.tokenAddressesByCode.some(
        entry =>
          BigInt(entry.tokenCode.toString()) === LiquidTokenCode &&
          entry.mint.equals(addresses.liqsolMint)
      ) &&
      outpost.precisionByTokenCode.some(
        entry =>
          BigInt(entry.tokenCode.toString()) === LiquidTokenCode &&
          entry.decimals === LiquidDecimals
      )
    return {
      nativeBalance: BigInt(nativeBalance),
      liquidBalance:
        account == null
          ? 0n
          : unpackAccount(addresses.userAta, account, TOKEN_2022_PROGRAM_ID)
              .amount,
      decimals: LiquidDecimals,
      minimumDeposit: BigInt(config.minUserDeposit.toString()),
      // TEMPORARY Testnet fallback: remove when its verified IDL gains the RC field.
      minimumSyndication:
        "minSyndicationPerTransfer" in config
          ? BigInt(config.minSyndicationPerTransfer.toString())
          : MinimumPositiveAmount,
      maximumSyndication: BigInt(config.maxSyndicationPerTransfer.toString()),
      depositEnabled: (config.featureFlags & DepositsEnabled) !== 0,
      postLaunch: "postLaunch" in state.wireState,
      mapped,
      paused: state.paused || state.frozen
    }
  }

  /** Quote the current contract fee using its five-entry circular pay-rate average and ceiling rounding. */
  async quoteDeposit(amount: bigint): Promise<SolanaDepositQuote> {
    if (amount <= 0n || amount > MaximumTokenAmount)
      throw new Error("Deposit amount must be a positive u64")
    const [config, history] = await Promise.all([
        this.program.account.globalConfig.fetch(
          this.coreAddress(Seed.globalConfig)
        ),
        this.program.account.payRateHistory.fetch(
          this.coreAddress(Seed.payRateHistory)
        )
      ]),
      initialized = history.totalEntriesAdded.isZero(),
      count = Math.min(
        DepositPayRateCount,
        history.maxEntries,
        history.entries.length
      ),
      rates = Array.from({ length: count }, (_, offset) => {
        const index = initialized
          ? offset
          : (history.currentIndex - 1 - offset + history.maxEntries) %
            history.maxEntries
        return BigInt(history.entries[index]?.scaledRate.toString() || "0")
      }).filter(rate => rate > 0n),
      average =
        rates.length === 0
          ? 0n
          : (rates.reduce((sum, rate) => sum + rate, 0n) +
              BigInt(rates.length) -
              1n) /
            BigInt(rates.length),
      numerator = average * BigInt(config.depositFeeMultiplier) * amount,
      fee = (numerator + DepositFeeScale - 1n) / DepositFeeScale,
      totalDebit = amount + fee
    if (numerator > MaximumFeeNumerator || totalDebit > MaximumTokenAmount)
      throw new Error(
        "Deposit including the protocol fee exceeds the contract limit"
      )
    return { amount, fee, totalDebit }
  }

  /** Build one native deposit after rechecking its protocol fee; the caller owns signing/confirmation. */
  async deposit(user: PublicKey, amount: bigint, seed: number) {
    const state = await this.read(user)
    if (!state.depositEnabled || state.paused)
      throw new Error("Solana deposits are disabled or paused")
    if (
      amount <= 0n ||
      amount < state.minimumDeposit ||
      amount >= state.nativeBalance
    )
      throw new Error(
        "Deposit must meet the minimum and leave SOL for fees and rent"
      )
    if (!Number.isInteger(seed) || seed < 0 || seed > MaximumSeed)
      throw new Error("Invalid unique deposit seed")
    const quote = await this.quoteDeposit(amount)
    if (quote.totalDebit >= state.nativeBalance)
      throw new Error(
        "Deposit plus protocol fee must leave SOL for transaction fees and account rent"
      )
    const addresses = this.addresses(user),
      ephemeralStake = await PublicKey.createWithSeed(
        user,
        `${EphemeralStakePrefix}${seed}`,
        StakeProgram.programId
      )
    return this.program.methods
      .solToLiqsol(new BN(amount.toString()), seed)
      .accountsStrict({
        user,
        depositAuthority: addresses.depositAuthority,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        liqsolProgram: addresses.liqsolProgram,
        payRateHistory: addresses.payRateHistory,
        stakeProgram: StakeProgram.programId,
        liqsolMint: addresses.liqsolMint,
        userAta: addresses.userAta,
        liqsolMintAuthority: addresses.liqsolMintAuthority,
        reservePool: addresses.reservePool,
        vault: addresses.vault,
        ephemeralStake,
        controllerState: addresses.controllerState,
        payoutState: addresses.payoutState,
        bucketAuthority: addresses.bucketAuthority,
        bucketTokenAccount: addresses.bucketTokenAccount,
        userRecord: addresses.userRecord,
        distributionState: addresses.distributionState,
        globalConfig: addresses.globalConfig,
        instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        clock: SYSVAR_CLOCK_PUBKEY,
        stakeHistory: SYSVAR_STAKE_HISTORY_PUBKEY,
        rent: SYSVAR_RENT_PUBKEY
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: DepositComputeUnitLimit
        })
      ])
      .transaction()
  }

  /** Build PostLaunch custody; never falls back to the prelaunch local-position instruction shape. */
  async syndicate(user: PublicKey, amount: bigint) {
    const state = await this.read(user)
    if (!state.postLaunch)
      throw new Error("Solana syndication requires PostLaunch")
    if (!state.mapped)
      throw new Error("Solana LIQSOL mint and precision are not configured")
    if (state.paused) throw new Error("Solana syndication is paused or frozen")
    if (
      amount <= 0n ||
      amount < state.minimumSyndication ||
      amount > state.liquidBalance ||
      amount > state.maximumSyndication
    )
      throw new Error(
        "Syndication must meet the minimum, wallet balance and configured limit"
      )
    const addresses = this.addresses(user)
    return this.program.methods
      .synd(new BN(amount.toString()))
      .accountsStrict({
        user,
        globalConfig: addresses.globalConfig,
        liqsolMint: addresses.liqsolMint,
        globalState: addresses.globalState,
        distributionState: addresses.distributionState,
        userAta: addresses.userAta,
        poolAuthority: addresses.poolAuthority,
        bucketAuthority: addresses.bucketAuthority,
        bucketTokenAccount: addresses.bucketTokenAccount,
        bucketUserRecord: addresses.bucketUserRecord,
        senderUserRecord: addresses.userRecord,
        receiverUserRecord: addresses.receiverUserRecord,
        extraAccountMetaList: addresses.extraAccountMetaList,
        liqsolCoreProgram: this.program.programId,
        transferHookProgram: addresses.transferHookProgram,
        liqsolPoolAta: addresses.liqsolPoolAta,
        outpostAccount: null,
        pretokenPurchaseHistory: null,
        outboundMessageBuffer: addresses.outboundMessageBuffer,
        config: addresses.config,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: SyndicationComputeUnitLimit
        })
      ])
      .transaction()
  }
}
