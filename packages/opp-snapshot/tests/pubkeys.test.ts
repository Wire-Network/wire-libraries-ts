import { Transaction, Wallet, zeroPadValue, type BaseWallet } from "ethers"

import {
  JsonRpcClient,
  OppAssertionType,
  recoverActorPubkeys,
  recoverSenderPubkey,
  type AssertionRow,
  type RpcTransaction
} from "@wireio/opp-snapshot"

const Recipient = "0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc"
const quantity = (value: bigint | number) => `0x${value.toString(16)}`

/** A wallet's signed EIP-1559 transfer, as `eth_getTransactionByHash` would report it. */
async function reported(wallet: BaseWallet): Promise<RpcTransaction> {
  const signed = Transaction.from(
    await wallet.signTransaction({
      type: 2,
      to: Recipient,
      nonce: 3,
      gasLimit: 21_000n,
      chainId: 31_337n,
      value: 5n,
      maxFeePerGas: 10n ** 10n,
      maxPriorityFeePerGas: 10n ** 9n
    })
  )
  return {
    hash: signed.hash,
    from: signed.from,
    to: signed.to,
    input: signed.data,
    nonce: quantity(signed.nonce),
    value: quantity(signed.value),
    gas: quantity(signed.gasLimit),
    maxFeePerGas: quantity(signed.maxFeePerGas),
    maxPriorityFeePerGas: quantity(signed.maxPriorityFeePerGas),
    chainId: quantity(signed.chainId),
    type: quantity(2),
    accessList: [],
    yParity: quantity(signed.signature.yParity),
    r: signed.signature.r,
    s: signed.signature.s
  }
}

/** A row of the given type, crediting `actor`, emitted by `txHash`. */
function row(assertionType: OppAssertionType, actor: string, txHash: string): AssertionRow {
  return {
    txHash,
    blockNumber: 1,
    blockTime: null,
    logIndex: 0,
    messageId: "0x01",
    previousMessageId: "0x00",
    messageTimestamp: 1n,
    assertionIndex: 0,
    assertionType,
    args: { staker: actor, purchaser: actor, buyer: actor }
  }
}

describe("pubkeys", () => {
  afterEach(() => jest.restoreAllMocks())

  it("recovers the sender's compressed key, and refuses one that does not derive the sender", async () => {
    const wallet = Wallet.createRandom(),
      transaction = await reported(wallet)
    expect(recoverSenderPubkey(transaction)).toBe(wallet.signingKey.compressedPublicKey)
    expect(recoverSenderPubkey({ ...transaction, from: Recipient })).toBeNull()
    expect(recoverSenderPubkey({ ...transaction, yParity: undefined })).toBeNull()
    expect(recoverSenderPubkey({ ...transaction, r: "0x00" })).toBeNull()
  })

  it("keys each self-signing staking actor's address by its recovered key", async () => {
    const staker = Wallet.createRandom(),
      purchaser = Wallet.createRandom(),
      viaContract = Wallet.createRandom(),
      relayer = Wallet.createRandom(),
      transactions = new Map([
        [zeroPadValue("0x01", 32), await reported(staker)],
        [zeroPadValue("0x02", 32), await reported(purchaser)],
        [zeroPadValue("0x03", 32), await reported(relayer)]
      ]),
      rpc = new JsonRpcClient("http://node.invalid"),
      read = jest
        .spyOn(rpc, "getTransactionByHash")
        .mockImplementation(async hash => transactions.get(hash))
    const pubkeys = await recoverActorPubkeys(rpc, [
      row(OppAssertionType.Stake, staker.address, zeroPadValue("0x01", 32)),
      row(OppAssertionType.Unstake, staker.address, zeroPadValue("0x01", 32)),
      row(OppAssertionType.LiqPretokenPurchase, purchaser.address, zeroPadValue("0x02", 32)),
      row(OppAssertionType.Stake, viaContract.address, zeroPadValue("0x03", 32)),
      row(OppAssertionType.PretokenPurchase, relayer.address, zeroPadValue("0x03", 32))
    ])
    expect(pubkeys).toEqual(
      new Map([
        [staker.address.toLowerCase(), staker.signingKey.compressedPublicKey],
        [purchaser.address.toLowerCase(), purchaser.signingKey.compressedPublicKey]
      ])
    )
    expect(read).toHaveBeenCalledTimes(3)
  })

  it("reports a failed transaction read and carries on", async () => {
    const warnings: string[] = [],
      rpc = new JsonRpcClient("http://node.invalid")
    jest.spyOn(rpc, "getTransactionByHash").mockRejectedValue(new Error("rate limited"))
    const pubkeys = await recoverActorPubkeys(
      rpc,
      [row(OppAssertionType.Stake, Recipient, zeroPadValue("0x01", 32))],
      { warn: message => warnings.push(message) }
    )
    expect(pubkeys.size).toBe(0)
    expect(warnings).toEqual([expect.stringMatching(/eth_getTransactionByHash .* failed: Error: rate limited/)])
  })
})
