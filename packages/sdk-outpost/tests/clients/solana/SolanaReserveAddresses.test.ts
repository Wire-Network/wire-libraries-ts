import { Keypair, PublicKey } from "@solana/web3.js"

import { SolanaReserveAddresses } from "@wireio/sdk-outpost"

const Unsigned64ByteLength = 8

function unsigned64Seed(value: bigint): Buffer {
  const seed = Buffer.alloc(Unsigned64ByteLength)
  seed.writeBigUInt64LE(value)
  return seed
}

describe("SolanaReserveAddresses", () => {
  it("derives every reserve lifecycle PDA from the deployed program", () => {
    const programId = Keypair.generate().publicKey,
      addresses = new SolanaReserveAddresses(programId),
      identity = { tokenCode: 1n, reserveCode: 2n },
      expectedReserve = PublicKey.findProgramAddressSync(
        [
          Buffer.from("reserve"),
          unsigned64Seed(1n),
          unsigned64Seed(2n)
        ],
        programId
      )[0],
      expectedVault = PublicKey.findProgramAddressSync(
        [
          Buffer.from("reserve_vault"),
          unsigned64Seed(1n),
          unsigned64Seed(2n)
        ],
        programId
      )[0]

    expect(addresses.reserve(identity).equals(expectedReserve)).toBe(true)
    expect(addresses.reserveVault(identity).equals(expectedVault)).toBe(true)
    expect(
      addresses
        .outpostConfig()
        .equals(
          PublicKey.findProgramAddressSync(
            [Buffer.from("outpost_config")],
            programId
          )[0]
        )
    ).toBe(true)
    expect(
      addresses
        .outboundMessageBuffer()
        .equals(
          PublicKey.findProgramAddressSync(
            [Buffer.from("outbound_message_buffer")],
            programId
          )[0]
        )
    ).toBe(true)
  })

  it("rejects reserve identity values outside the protocol u64 range", () => {
    const addresses = new SolanaReserveAddresses(Keypair.generate().publicKey)

    expect(() => addresses.unsigned64(0, "tokenCode")).toThrow(
      "tokenCode must be between 1 and uint64 max."
    )
  })
})
