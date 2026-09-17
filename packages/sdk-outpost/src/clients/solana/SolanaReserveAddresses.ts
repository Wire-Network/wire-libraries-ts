import { BN } from "@coral-xyz/anchor"
import { PublicKey } from "@solana/web3.js"

import {
  assertReserveUnsigned64,
  type OutpostReserveIdentity
} from "../../reserves/index.js"

const SolanaReserveSeed = {
    outpostConfig: Buffer.from("outpost_config"),
    outboundMessageBuffer: Buffer.from("outbound_message_buffer"),
    reserve: Buffer.from("reserve"),
    reserveVault: Buffer.from("reserve_vault")
  } as const,
  Unsigned64ByteLength = 8

/** Canonical PDA derivation for Solana reserve lifecycle and swap clients. */
export class SolanaReserveAddresses {
  /** Bind reserve address derivation to one verified program deployment. */
  constructor(private readonly programId: PublicKey) {}

  /** Derive the singleton outpost configuration PDA. */
  outpostConfig(): PublicKey {
    return this.derive([SolanaReserveSeed.outpostConfig])
  }

  /** Derive the singleton outbound message-buffer PDA. */
  outboundMessageBuffer(): PublicKey {
    return this.derive([SolanaReserveSeed.outboundMessageBuffer])
  }

  /** Derive a reserve account PDA. */
  reserve(identity: OutpostReserveIdentity): PublicKey {
    return this.reserveAddress(SolanaReserveSeed.reserve, identity)
  }

  /** Derive a reserve custody-vault PDA. */
  reserveVault(identity: OutpostReserveIdentity): PublicKey {
    return this.reserveAddress(SolanaReserveSeed.reserveVault, identity)
  }

  /** Convert an SDK reserve integer to Anchor's u64 representation. */
  unsigned64(
    value: OutpostReserveIdentity["tokenCode"],
    field: string
  ): BN {
    return new BN(assertReserveUnsigned64(value, field).toString())
  }

  private derive(seeds: Buffer[]): PublicKey {
    return PublicKey.findProgramAddressSync(seeds, this.programId)[0]
  }

  private reserveAddress(
    seed: Buffer,
    identity: OutpostReserveIdentity
  ): PublicKey {
    return this.derive([
      seed,
      this.unsigned64Seed(identity.tokenCode, "tokenCode"),
      this.unsigned64Seed(identity.reserveCode, "reserveCode")
    ])
  }

  private unsigned64Seed(
    value: OutpostReserveIdentity["tokenCode"],
    field: string
  ): Buffer {
    return this.unsigned64(value, field).toArrayLike(
      Buffer,
      "le",
      Unsigned64ByteLength
    )
  }
}
