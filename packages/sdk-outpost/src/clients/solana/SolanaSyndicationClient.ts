import { BN, type Program } from "@coral-xyz/anchor"
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
import type { LiqsolCore } from "@wireio/outpost-solana-artifacts"
import type { OutpostDeploymentProfile } from "../../deployments/index.js"

const DepositComputeUnitLimit = 1_000_000,
  SyndicationComputeUnitLimit = 800_000,
  DepositsEnabled = 1,
  LiquidDecimals = 9,
  EphemeralStakePrefix = "ephemeral_",
  MaximumSeed = 0xffffffff,
  LiquidTokenCode = 53413609783296n

/** Deployed companion programs selected alongside the verified core program. */
export type SolanaLiqsolDeployment = NonNullable<
  OutpostDeploymentProfile["solana"]["liqsol"]
>

/** Wallet funds and on-chain admission gates; no readiness is inferred from an RPC URL. */
export interface SolanaSyndicationState {
  nativeBalance: bigint
  liquidBalance: bigint
  decimals: number
  minimumDeposit: bigint
  maximumSyndication: bigint
  depositEnabled: boolean
  postLaunch: boolean
  mapped: boolean
  paused: boolean
}

/** Core-owned PDA seeds shared by deposit and PostLaunch syndication. */
const Seed = {
  globalState: "outpost_global_state",
  globalConfig: "global_config",
  distributionState: "distribution_state",
  poolAuthority: "liqsol_pool",
  bucketAuthority: "liqsol_bucket",
  userRecord: "user_record",
  liqsolMint: "liqsol_mint",
  mintAuthority: "mint_authority",
  extraAccountMetaList: "extra-account-metas",
  reservePool: "reserve_pool",
  depositAuthority: "deposit_authority",
  vault: "vault",
  controllerState: "stake_controller",
  payoutState: "payout_state",
  payRateHistory: "pay_rate_history",
  config: "outpost_config",
  outboundMessageBuffer: "outbound_message_buffer"
} as const

/** Browser-safe transaction construction for the current liqsol-core contract. */
export class SolanaSyndicationClient {
  /** Accept the verified core and explicit companion identities; no private keys or admin actions. */
  constructor(
    readonly program: Program<LiqsolCore>,
    private readonly deployment: SolanaLiqsolDeployment
  ) {}

  /** Derive the canonical Token-2022 and core account set for a wallet. */
  addresses(user: PublicKey) {
    const liqsolProgram = new PublicKey(this.deployment.tokenProgramAddress),
      transferHookProgram = new PublicKey(
        this.deployment.transferHookProgramAddress
      ),
      core = (seed: string, ...rest: Buffer[]) =>
        PublicKey.findProgramAddressSync(
          [Buffer.from(seed), ...rest],
          this.program.programId
        )[0],
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
    const a = this.addresses(user),
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
        this.program.account.globalConfig.fetch(a.globalConfig),
        this.program.account.globalState.fetch(a.globalState),
        this.program.account.outpostConfig.fetch(a.config),
        this.program.account.distributionState.fetch(a.distributionState),
        connection.getAccountInfo(a.userAta),
        connection.getBalance(user),
        connection.getMultipleAccountsInfo([
          a.liqsolProgram,
          a.transferHookProgram
        ])
      ])
    if (
      companions.some(program => !program?.executable) ||
      !distribution.liqsolMint.equals(a.liqsolMint)
    ) {
      throw new Error(
        "The deployed liqSOL mint or companion programs do not match the deployment profile"
      )
    }
    const mapped =
      outpost.tokenAddressesByCode.some(
        entry =>
          BigInt(entry.tokenCode.toString()) === LiquidTokenCode &&
          entry.mint.equals(a.liqsolMint)
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
          : unpackAccount(a.userAta, account, TOKEN_2022_PROGRAM_ID).amount,
      decimals: LiquidDecimals,
      minimumDeposit: BigInt(config.minUserDeposit.toString()),
      maximumSyndication: BigInt(config.maxSyndicationPerTransfer.toString()),
      depositEnabled: (config.featureFlags & DepositsEnabled) !== 0,
      postLaunch: "postLaunch" in state.wireState,
      mapped,
      paused: state.paused || state.frozen
    }
  }

  /** Build one native deposit. The caller supplies a unique seed and owns signing/confirmation. */
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
    const a = this.addresses(user),
      ephemeralStake = await PublicKey.createWithSeed(
        user,
        `${EphemeralStakePrefix}${seed}`,
        StakeProgram.programId
      )
    return this.program.methods
      .solToLiqsol(new BN(amount.toString()), seed)
      .accountsStrict({
        user,
        depositAuthority: a.depositAuthority,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        liqsolProgram: a.liqsolProgram,
        payRateHistory: a.payRateHistory,
        stakeProgram: StakeProgram.programId,
        liqsolMint: a.liqsolMint,
        userAta: a.userAta,
        liqsolMintAuthority: a.liqsolMintAuthority,
        reservePool: a.reservePool,
        vault: a.vault,
        ephemeralStake,
        controllerState: a.controllerState,
        payoutState: a.payoutState,
        bucketAuthority: a.bucketAuthority,
        bucketTokenAccount: a.bucketTokenAccount,
        userRecord: a.userRecord,
        distributionState: a.distributionState,
        globalConfig: a.globalConfig,
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
      amount > state.liquidBalance ||
      amount > state.maximumSyndication
    )
      throw new Error(
        "Syndication exceeds the wallet balance or configured limit"
      )
    const a = this.addresses(user)
    return this.program.methods
      .synd(new BN(amount.toString()))
      .accountsStrict({
        user,
        globalConfig: a.globalConfig,
        liqsolMint: a.liqsolMint,
        globalState: a.globalState,
        distributionState: a.distributionState,
        userAta: a.userAta,
        poolAuthority: a.poolAuthority,
        bucketAuthority: a.bucketAuthority,
        bucketTokenAccount: a.bucketTokenAccount,
        bucketUserRecord: a.bucketUserRecord,
        senderUserRecord: a.userRecord,
        receiverUserRecord: a.receiverUserRecord,
        extraAccountMetaList: a.extraAccountMetaList,
        liqsolCoreProgram: this.program.programId,
        transferHookProgram: a.transferHookProgram,
        liqsolPoolAta: a.liqsolPoolAta,
        outpostAccount: null,
        pretokenPurchaseHistory: null,
        outboundMessageBuffer: a.outboundMessageBuffer,
        config: a.config,
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
