import { BN } from "@coral-xyz/anchor"
import { PublicKey } from "@solana/web3.js"
import { SolanaOutpostAddresses } from "./SolanaOutpostAddresses.js"

import {
  assertReserveUnsigned64,
  type OutpostReserveIdentity
} from "../../reserves/index.js"

const SolanaReserveSeed = {
    reserve: Buffer.from("reserve"),
    reserveVault: Buffer.from("reserve_vault")
  } as const,
  Unsigned64ByteLength = 8

/** Canonical PDA derivation for Solana reserve lifecycle and swap clients. */
export class SolanaReserveAddresses extends SolanaOutpostAddresses {
  /** Derive a reserve account PDA. */
  reserve(identity: OutpostReserveIdentity): PublicKey {
    return this.reserveAddress(SolanaReserveSeed.reserve, identity)
  }

  /** Derive a reserve custody-vault PDA. */
  reserveVault(identity: OutpostReserveIdentity): PublicKey {
    return this.reserveAddress(SolanaReserveSeed.reserveVault, identity)
  }

  /** Convert an SDK reserve integer to Anchor's u64 representation. */
  unsigned64(value: OutpostReserveIdentity["tokenCode"], field: string): BN {
    return new BN(assertReserveUnsigned64(value, field).toString())
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
