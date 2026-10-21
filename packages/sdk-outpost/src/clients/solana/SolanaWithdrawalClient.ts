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
  SYSVAR_RENT_PUBKEY,
  SYSVAR_STAKE_HISTORY_PUBKEY
} from "@solana/web3.js"
import { SolanaSyndicationClient } from "./SolanaSyndicationClient.js"

/** An owned withdrawal receipt, not a promise of immediate native payout. */
export interface SolanaWithdrawalReceipt {
  /** Receipt mint public key, discovered from current ownership. */
  mint: string
  /** Requested native payout in lamports. */
  amount: bigint
  /** Receipt epoch used for serviceability checks. */
  epoch: bigint
  /** Whether claims are enabled and this receipt epoch is serviceable. */
  claimable: boolean
}

/** Native withdrawal gates and receipts from the verified core program. */
export interface SolanaWithdrawalState {
  /** Minimum withdrawal request in LIQ base units. */
  minimum: bigint
  /** Whether new withdrawal requests are enabled. */
  enabled: boolean
  /** Whether native payout claims are enabled. */
  claimsEnabled: boolean
  /** Highest epoch currently serviced by network processing. */
  serviceableEpoch: bigint
  /** Owned, unfulfilled receipts discovered from Token-2022 accounts. */
  receipts: SolanaWithdrawalReceipt[]
}

const ReceiptReadBatchSize = 100,
  ReceiptIdByteLength = 8,
  WithdrawalComputeUnitLimit = 1_000_000,
  WithdrawalsEnabled = 1 << 1,
  ClaimsEnabled = 1 << 2,
  MaximumWithdrawalUnits = (1n << 64n) - 1n

/** Builds user withdrawals; never advances serviceability or runs validator cranks. */
export class SolanaWithdrawalClient {
  /** Use the same already verified core program as the syndication client. */
  constructor(private readonly syndication: SolanaSyndicationClient) {}

  /** Derive a core-owned PDA using the canonical seed list. */
  private address(seed: string, ...rest: Buffer[]): PublicKey {
    return solanaProgramAddress(
      this.syndication.program.programId,
      seed,
      ...rest
    )
  }

  /** Discover receipts by current Token-2022 ownership, including after reconnect. */
  async read(user: PublicKey): Promise<SolanaWithdrawalState> {
    const program = this.syndication.program,
      [global, config, owned] = await Promise.all([
        program.account.global.fetch(this.address(Seed.global)),
        program.account.globalConfig.fetch(this.address(Seed.globalConfig)),
        program.provider.connection.getTokenAccountsByOwner(user, {
          programId: TOKEN_2022_PROGRAM_ID
        })
      ]),
      mints = owned.value
        .map(entry =>
          unpackAccount(entry.pubkey, entry.account, TOKEN_2022_PROGRAM_ID)
        )
        .filter(account => account.amount === 1n && account.owner.equals(user))
        .map(account => account.mint),
      receipts: SolanaWithdrawalReceipt[] = [],
      serviceableEpoch = BigInt(global.serviceableEpoch.toString()),
      claimsEnabled = (config.featureFlags & ClaimsEnabled) !== 0
    await Array.from(
      { length: Math.ceil(mints.length / ReceiptReadBatchSize) },
      (_, index) => index * ReceiptReadBatchSize
    ).reduce(async (previous, offset) => {
      await previous
      const batch = mints.slice(offset, offset + ReceiptReadBatchSize),
        rows = await program.account.liqReceiptData.fetchMultiple(
          batch.map(mint => this.address(Seed.receiptData, mint.toBuffer()))
        )
      rows.forEach((row, index) => {
        if (!row || row.fulfilled) return
        const expected = this.address(
          Seed.receiptMint,
          row.receiptId.toArrayLike(Buffer, "le", ReceiptIdByteLength)
        )
        if (!expected.equals(batch[index]))
          throw new Error(
            "Withdrawal receipt mint does not match its receipt ID"
          )
        const epoch = BigInt(row.epoch.toString())
        receipts.push({
          mint: expected.toBase58(),
          amount: BigInt(row.liqports.toString()),
          epoch,
          claimable: claimsEnabled && epoch <= serviceableEpoch
        })
      })
    }, Promise.resolve())
    return {
      minimum: BigInt(config.minUnstakeRequest.toString()),
      enabled: (config.featureFlags & WithdrawalsEnabled) !== 0,
      claimsEnabled,
      serviceableEpoch,
      receipts
    }
  }

  /** Burn external LIQ and create a receipt; its epoch decides when it can be claimed. */
  async request(user: PublicKey, amount: bigint) {
    const [state, funds] = await Promise.all([
      this.read(user),
      this.syndication.read(user)
    ])
    if (!state.enabled) throw new Error("Solana withdrawals are disabled")
    if (
      amount <= 0n ||
      amount < state.minimum ||
      amount > funds.liquidBalance ||
      amount > MaximumWithdrawalUnits
    )
      throw new Error(
        "Withdrawal must meet the minimum and available external LIQ balance"
      )
    const program = this.syndication.program,
      addresses = this.syndication.addresses(user),
      global = this.address(Seed.global),
      next = await program.account.global.fetch(global),
      nftMint = this.address(
        Seed.receiptMint,
        next.nextReceiptId.toArrayLike(Buffer, "le", ReceiptIdByteLength)
      )
    return program.methods
      .requestWithdraw(new BN(amount.toString()))
      .accountsStrict({
        user,
        owner: user,
        global,
        liqsolMint: addresses.liqsolMint,
        userAta: addresses.userAta,
        userRecord: addresses.userRecord,
        distributionState: addresses.distributionState,
        bucketTokenAccount: addresses.bucketTokenAccount,
        reservePool: addresses.reservePool,
        stakeAllocationState: this.address(Seed.stakeAllocationState),
        stakeMetrics: this.address(Seed.stakeMetrics),
        maintenanceLedger: this.address(Seed.maintenanceLedger),
        globalConfig: addresses.globalConfig,
        clock: SYSVAR_CLOCK_PUBKEY,
        mintAuthority: this.address(Seed.mintAuthority),
        receiptData: this.address(Seed.receiptData, nftMint.toBuffer()),
        metadata: this.address(Seed.mintMetadata),
        nftMint,
        nftAta: getAssociatedTokenAddressSync(
          nftMint,
          user,
          false,
          TOKEN_2022_PROGRAM_ID
        ),
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        tokenInterface: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: WithdrawalComputeUnitLimit
        })
      ])
      .transaction()
  }

  /** Recheck ownership and serviceability before constructing the native payout. */
  async claim(user: PublicKey, mint: string) {
    const state = await this.read(user),
      receipt = state.receipts.find(row => row.mint === mint)
    if (!receipt?.claimable)
      throw new Error("Withdrawal is not owned, enabled or serviceable yet")
    const mintAccount = new PublicKey(mint)
    return this.syndication.program.methods
      .claimWithdraw()
      .accountsStrict({
        user,
        global: this.address(Seed.global),
        mintAuthority: this.address(Seed.mintAuthority),
        receiptData: this.address(Seed.receiptData, mintAccount.toBuffer()),
        mintAccount,
        ownerAta: getAssociatedTokenAddressSync(
          mintAccount,
          user,
          false,
          TOKEN_2022_PROGRAM_ID
        ),
        reservePool: this.address(Seed.reservePool),
        vault: this.address(Seed.vault),
        clock: SYSVAR_CLOCK_PUBKEY,
        stakeHistory: SYSVAR_STAKE_HISTORY_PUBKEY,
        globalConfig: this.address(Seed.globalConfig),
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        stakeProgram: StakeProgram.programId,
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID
      })
      .transaction()
  }
}
