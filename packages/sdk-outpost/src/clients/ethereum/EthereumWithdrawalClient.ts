import type {
  DepositManager,
  LiqEthToken,
  WithdrawalQueue
} from "@wireio/outpost-ethereum-artifacts"
import {
  getAddress,
  type ContractTransactionResponse,
  type Provider,
  type Signer
} from "ethers"
import { assertEthereumSigner, ethereumProvider } from "./Connection.js"

/** Owned withdrawal NFT and its observed on-chain readiness, not a payout promise. */
export interface EthereumWithdrawalReceipt {
  /** Receipt NFT ID, kept exact through discovery and submission. */
  id: bigint
  /** Requested native payout in wei. */
  amount: bigint
  /** Earliest claim time as a Unix timestamp in seconds. */
  readyAt: bigint
  /** Whether the observed block timestamp meets the receipt delay. */
  ready: boolean
  /** Whether the payer currently holds enough ETH for this receipt alone. */
  funded: boolean
  /** Observed readiness, funding and pause checks; not a payout guarantee. */
  claimable: boolean
}

/** Exact wallet and queue state observed at one Ethereum block. */
export interface EthereumWithdrawalState {
  /** Block used consistently for these state reads. */
  blockNumber: number
  /** Observed block timestamp in seconds. */
  timestamp: bigint
  /** Owner native ETH balance in wei. */
  nativeBalance: bigint
  /** Owner external LIQ balance in token base units. */
  liquidBalance: bigint
  /** External LIQ display precision. */
  decimals: number
  /** Configured withdrawal delay in seconds. */
  withdrawalDelay: bigint
  /** Whether the liquid token currently pauses withdrawal requests. */
  requestPaused: boolean
  /** Whether DepositManager currently pauses payouts. */
  claimPaused: boolean
  /** Native ETH held by the verified DepositManager payer. */
  payoutBalance: bigint
  /** All discovered owned receipts within the enumeration limit. */
  receipts: EthereumWithdrawalReceipt[]
}

const ReceiptReadBatchSize = 50,
  MaxReceiptEnumeration = 10_000n

/** User-only exits; never funds the queue, bypasses its delay or cranks validators. */
export class EthereumWithdrawalClient {
  /** Construct from producer bindings selected by an already verified deployment. */
  constructor(
    private readonly token: LiqEthToken,
    private readonly queue: WithdrawalQueue,
    /** The deployed queue pays through DepositManager.claim. */
    private readonly depositPayer: DepositManager,
    private readonly connection: Provider | Signer
  ) {}

  /** Check wiring and enumerate owned receipts at one block, retaining exact uint256 IDs. */
  async read(owner: string): Promise<EthereumWithdrawalState> {
    const provider = ethereumProvider(this.connection),
      block = await provider.getBlock("latest")
    if (!block) throw new Error("Ethereum block is unavailable")
    const blockTag = block.number,
      overrides = { blockTag },
      queueAddress = await this.queue.getAddress(),
      payer = await this.depositPayer.getAddress(),
      [
        wiredQueue,
        count,
        liquidBalance,
        nativeBalance,
        decimals,
        withdrawalDelay,
        requestPaused,
        claimPaused,
        payoutBalance
      ] = await Promise.all([
        this.token._withdrawalQueue(overrides),
        this.queue.balanceOf(owner, overrides),
        this.token.balanceOf(owner, overrides),
        provider.getBalance(owner, blockTag),
        this.token.decimals(overrides),
        this.queue.withdrawDelay(overrides),
        this.token.paused(overrides),
        this.depositPayer.paused(overrides),
        provider.getBalance(payer, blockTag)
      ])
    if (getAddress(wiredQueue) !== getAddress(queueAddress))
      throw new Error("Liquid token does not use the verified withdrawal queue")
    if (
      getAddress(await this.depositPayer.withdrawalQueue(overrides)) !==
      getAddress(queueAddress)
    )
      throw new Error(
        "Deposit manager does not use the verified withdrawal queue"
      )
    if (count > MaxReceiptEnumeration)
      throw new Error("Receipt count exceeds the bounded enumeration limit")
    const timestamp = BigInt(block.timestamp),
      receipts: EthereumWithdrawalReceipt[] = []
    // Bounded RPC concurrency; never truncate an owner's receipt list.
    await Array.from(
      { length: Math.ceil(Number(count) / ReceiptReadBatchSize) },
      (_, index) => index * ReceiptReadBatchSize
    ).reduce(async (previous, offset) => {
      await previous
      const batch = await Promise.all(
        Array.from(
          { length: Math.min(ReceiptReadBatchSize, Number(count) - offset) },
          async (_, index) => {
            const id = await this.queue.tokenOfOwnerByIndex(
                owner,
                offset + index,
                overrides
              ),
              [actualOwner, request] = await Promise.all([
                this.queue.ownerOf(id, overrides),
                this.queue.info(id, overrides)
              ])
            if (getAddress(actualOwner) !== getAddress(owner))
              throw new Error("Withdrawal receipt owner changed")
            const ready = timestamp >= request.readyAt,
              funded = payoutBalance >= request.ethAmount
            return {
              id,
              amount: request.ethAmount,
              readyAt: request.readyAt,
              ready,
              funded,
              claimable: ready && funded && !claimPaused
            }
          }
        )
      )
      receipts.push(...batch)
    }, Promise.resolve())
    return {
      blockNumber: block.number,
      timestamp,
      nativeBalance,
      liquidBalance,
      decimals: Number(decimals),
      withdrawalDelay,
      requestPaused,
      claimPaused,
      payoutBalance,
      receipts
    }
  }

  /** Burn the reviewed external LIQ amount and request its native withdrawal NFT. */
  async request(amount: bigint): Promise<ContractTransactionResponse> {
    const signer = assertEthereumSigner(this.connection, "Unstake"),
      owner = await signer.getAddress(),
      state = await this.read(owner)
    if (state.requestPaused)
      throw new Error("Liquid staking withdrawals are paused")
    if (amount <= 0n || amount > state.liquidBalance)
      throw new Error("Unstake amount exceeds the available LIQ balance")
    const shares = await this.token.safeBurn.staticCall(owner, amount)
    if (shares <= 0n)
      throw new Error("Unstake amount is below one liquid-token share")
    return this.token.safeBurn(owner, amount)
  }

  /** Freshly verify ownership, chain time and payout funding; submit exactly one claim. */
  async claim(id: bigint): Promise<ContractTransactionResponse> {
    const signer = assertEthereumSigner(this.connection, "Withdrawal claim"),
      state = await this.read(await signer.getAddress()),
      receipt = state.receipts.find(row => row.id === id)
    if (!receipt)
      throw new Error("Withdrawal receipt is not owned by the signing wallet")
    if (!receipt.ready) throw new Error("Withdrawal delay has not elapsed")
    if (state.claimPaused) throw new Error("Withdrawal claims are paused")
    if (!receipt.funded)
      throw new Error("Withdrawal payout is awaiting native ETH funding")
    return this.depositPayer.claim(id)
  }
}
