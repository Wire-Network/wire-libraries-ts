import type { BAR, IERC1155 } from "@wireio/outpost-ethereum-artifacts"
import { IERC1155__factory } from "@wireio/outpost-ethereum-artifacts"
import { KeyType, Name, PublicKey } from "@wireio/sdk-core"
import {
  JsonRpcProvider,
  Wallet,
  ZeroAddress,
  getBytes,
  type EventLog,
  type TransactionReceipt,
  type TransactionResponse
} from "ethers"

import {
  EthereumNodeOwnerClient,
  EthereumNodeOwnerTier
} from "@wireio/sdk-outpost"

const BarAddress = "0x18E317A7D70d8fBf8e6E893616b52390EbBdb629",
  TokenContractAddress = "0x5c74c94173F05dA1720953407cbb920F3DF9f887",
  CommitTransactionHash = `0x${"11".repeat(32)}`,
  ApprovalTransactionHash = `0x${"22".repeat(32)}`,
  TestPrivateKey = `0x${"33".repeat(32)}`,
  WireAccountName = "nodeowner",
  WireAccount = Name.from(WireAccountName),
  TransactionReceiptFixture = {
    logs: [],
    status: 1
  } as unknown as TransactionReceipt

/** Create a confirmed transaction fixture with optional parsed logs. */
function transactionFixture(
  hash: string,
  logs: readonly EventLog[] = []
): TransactionResponse {
  return {
    hash,
    wait: jest.fn(async () => ({ ...TransactionReceiptFixture, logs }))
  } as unknown as TransactionResponse
}

/** Create generated BAR and IERC-1155 fixtures for one node-owner flow. */
function contractFixtures(
  approved = true,
  tokenContractAddress = TokenContractAddress
) {
  const wallet = new Wallet(TestPrivateKey),
    committedEvent = {
      eventName: "NodeCommitted",
      args: [
        wallet.address,
        BigInt(EthereumNodeOwnerTier.T2),
        TokenContractAddress,
        WireAccountName
      ]
    } as unknown as EventLog,
    commitTransaction = transactionFixture(CommitTransactionHash, [
      committedEvent
    ]),
    approvalTransaction = transactionFixture(ApprovalTransactionHash),
    bar = {
      target: BarAddress,
      getAddress: jest.fn(async () => BarAddress),
      wireNodesContract: jest.fn(async () => tokenContractAddress),
      commitNode: jest.fn(async () => commitTransaction)
    } as unknown as BAR,
    token = {
      balanceOf: jest.fn(async (_owner: string, tokenId: number) =>
        BigInt(tokenId === EthereumNodeOwnerTier.T2 ? 1 : 0)
      ),
      isApprovedForAll: jest.fn(async () => approved),
      setApprovalForAll: jest.fn(async () => approvalTransaction)
    } as unknown as IERC1155

  jest.spyOn(IERC1155__factory, "connect").mockReturnValue(token)
  return { wallet, bar, token, commitTransaction, approvalTransaction }
}

/** Return an sdk-core public-key input aligned with the EVM test signer. */
function wirePublicKey(wallet: Wallet): PublicKey {
  return PublicKey.from({
    type: KeyType.K1,
    compressed: getBytes(wallet.signingKey.compressedPublicKey)
  })
}

afterEach(() => jest.restoreAllMocks())

describe("EthereumNodeOwnerClient", () => {
  it("reads only owned tiers from BAR's canonical WireNodes contract", async () => {
    const { wallet, bar, token } = contractFixtures(),
      client = new EthereumNodeOwnerClient(bar, wallet)

    await expect(client.ownedSlots(wallet.address)).resolves.toEqual([
      {
        tokenId: EthereumNodeOwnerTier.T2,
        balance: 1n,
        tokenContractAddress: TokenContractAddress
      }
    ])
    expect(token.balanceOf).toHaveBeenCalledTimes(3)
  })

  it("commits through BAR without an unnecessary approval", async () => {
    const { wallet, bar, token, commitTransaction } = contractFixtures(),
      client = new EthereumNodeOwnerClient(bar, wallet),
      submission = await client.commit({
        tokenId: EthereumNodeOwnerTier.T2,
        wireAccountName: WireAccount,
        wirePublicKey: wirePublicKey(wallet),
        depositorPublicKey: wallet.signingKey.publicKey
      })

    expect(submission).toEqual({
      transactionId: CommitTransactionHash,
      approvalTransactionId: undefined,
      committed: {
        owner: wallet.address,
        tokenId: EthereumNodeOwnerTier.T2,
        tokenContractAddress: TokenContractAddress,
        wireAccountName: WireAccountName
      }
    })
    expect(token.setApprovalForAll).not.toHaveBeenCalled()
    expect(bar.commitNode).toHaveBeenCalledWith(
      EthereumNodeOwnerTier.T2,
      WireAccountName,
      expect.objectContaining({ keyType: 1 }),
      getBytes(wallet.signingKey.publicKey)
    )
    expect(commitTransaction.wait).toHaveBeenCalledWith(1)
  })

  it("confirms ERC-1155 approval before committing when required", async () => {
    const { wallet, bar, token, approvalTransaction } = contractFixtures(false),
      client = new EthereumNodeOwnerClient(bar, wallet)

    await expect(
      client.commit({
        tokenId: EthereumNodeOwnerTier.T2,
        wireAccountName: WireAccount,
        wirePublicKey: wirePublicKey(wallet),
        depositorPublicKey: wallet.signingKey.publicKey
      })
    ).resolves.toEqual(
      expect.objectContaining({
        approvalTransactionId: ApprovalTransactionHash
      })
    )
    expect(token.setApprovalForAll).toHaveBeenCalledWith(BarAddress, true)
    expect(approvalTransaction.wait).toHaveBeenCalledWith(1)
  })

  it("rejects provider-only writes and depositor keys from another signer", async () => {
    const { wallet, bar } = contractFixtures(),
      providerClient = new EthereumNodeOwnerClient(
        bar,
        new JsonRpcProvider()
      ),
      signerClient = new EthereumNodeOwnerClient(bar, wallet),
      otherWallet = Wallet.createRandom(),
      request = {
        tokenId: EthereumNodeOwnerTier.T2,
        wireAccountName: WireAccount,
        wirePublicKey: wirePublicKey(wallet),
        depositorPublicKey: wallet.signingKey.publicKey
      }

    await expect(providerClient.commit(request)).rejects.toThrow(
      "requires a connected signer"
    )
    await expect(
      signerClient.commit({
        ...request,
        depositorPublicKey: otherWallet.signingKey.publicKey
      })
    ).rejects.toThrow("does not belong to the EVM signer")
    expect(bar.commitNode).not.toHaveBeenCalled()
  })

  it("fails closed when BAR has no canonical WireNodes contract", async () => {
    const { wallet, bar } = contractFixtures(true, ZeroAddress)

    await expect(
      new EthereumNodeOwnerClient(bar, wallet).canonicalTokenContractAddress()
    ).rejects.toThrow("no canonical WireNodes contract")
  })
})
