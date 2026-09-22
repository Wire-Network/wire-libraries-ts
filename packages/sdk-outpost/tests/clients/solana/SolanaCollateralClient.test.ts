import { Program, BorshInstructionCoder, type BN } from "@coral-xyz/anchor"
import {
  liqsolCoreIdl,
  type LiqsolCore
} from "@wireio/outpost-solana-artifacts"
import { SystemContracts } from "@wireio/sdk-core"
import { SolanaCollateralClient } from "@wireio/sdk-outpost"
import { PublicKey, SystemProgram } from "@solana/web3.js"
import {
  createOutpostDeploymentProfileFixture,
  createSolanaProviderFixture
} from "../../Fixtures.js"

interface DecodedCollateralArguments {
  amount: BN
}

describe("SolanaCollateralClient", () => {
  it("records the source signature before confirmation and reports a failed instruction", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createSolanaProviderFixture(profile),
      program = new Program<LiqsolCore>(
        {
          ...liqsolCoreIdl,
          address: profile.solana.programs.liqsolCore.address
        },
        provider
      ),
      client = new SolanaCollateralClient(provider, program),
      signature = "4".repeat(64),
      confirm = jest
        .spyOn(provider.connection, "confirmTransaction")
        .mockResolvedValue({
          context: { slot: 1 },
          value: { err: { InstructionError: [0, "InvalidArgument"] } }
        }),
      onSubmitted = jest.fn(() => expect(confirm).not.toHaveBeenCalled())
    jest
      .spyOn(provider.connection, "getLatestBlockhash")
      .mockResolvedValue({
        blockhash: "1".repeat(32),
        lastValidBlockHeight: 99
      })
    jest
      .spyOn(provider.connection, "sendRawTransaction")
      .mockResolvedValue(signature)
    await expect(
      client.depositNative(
        {
          operatorType:
            SystemContracts.SysioOpregOperatortype.OPERATOR_TYPE_BATCH,
          tokenCode: 1n,
          amount: 1n,
          depotBalance: 0n
        },
        { onSubmitted }
      )
    ).rejects.toThrow("InvalidArgument")
    expect(onSubmitted).toHaveBeenCalledWith({ transactionId: signature })
    expect(confirm).toHaveBeenCalledWith(
      { blockhash: "1".repeat(32), lastValidBlockHeight: 99, signature },
      "confirmed"
    )
  })

  it("encodes exact lamports with the producer-defined custody accounts and no withdrawal capability", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createSolanaProviderFixture(profile),
      program = new Program<LiqsolCore>(
        {
          ...liqsolCoreIdl,
          address: profile.solana.programs.liqsolCore.address
        },
        provider
      ),
      client = new SolanaCollateralClient(provider, program),
      amount = 9_007_199_254_740_993n,
      instruction = await client.createNativeDepositInstruction({
        operatorType:
          SystemContracts.SysioOpregOperatortype.OPERATOR_TYPE_UNDERWRITER,
        tokenCode: 1n,
        amount,
        depotBalance: 0n
      }),
      position = PublicKey.findProgramAddressSync(
        [
          Buffer.from("collateral_position"),
          provider.wallet.publicKey.toBuffer(),
          Buffer.from([1, 0, 0, 0, 0, 0, 0, 0])
        ],
        program.programId
      )[0],
      decoded = new BorshInstructionCoder(liqsolCoreIdl).decode(
        instruction.data
      )!
    expect(decoded.name).toBe("deposit")
    expect((decoded.data as DecodedCollateralArguments).amount.toString()).toBe(
      amount.toString()
    )
    expect(
      instruction.keys.some(
        key => key.pubkey.equals(position) && key.isWritable
      )
    ).toBe(true)
    expect(
      instruction.keys.some(
        key => key.pubkey.equals(provider.wallet.publicKey) && key.isSigner
      )
    ).toBe(true)
    expect(
      instruction.keys.some(key => key.pubkey.equals(SystemProgram.programId))
    ).toBe(true)
    expect(client.capabilities).toEqual({
      nativeDeposit: true,
      nativeWithdrawal: false
    })
    expect("requestNativeWithdrawal" in client).toBe(false)
  })
})
