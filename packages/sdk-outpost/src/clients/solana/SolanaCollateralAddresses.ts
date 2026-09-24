import { BN } from "@coral-xyz/anchor"
import type { PublicKey } from "@solana/web3.js"
import { SolanaOutpostAddresses } from "./SolanaOutpostAddresses.js"

const SolanaCollateralSeed = {
    registry: Buffer.from("operator_registry"),
    vault: Buffer.from("outpost_vault"),
    position: Buffer.from("collateral_position")
  } as const,
  TokenCodeBytes = 8

/** Producer-defined collateral PDAs absent from the generated IDL's seed metadata. */
export class SolanaCollateralAddresses extends SolanaOutpostAddresses {
  /** Derive the singleton operator registry. */
  operatorRegistry(): PublicKey {
    return this.derive([SolanaCollateralSeed.registry])
  }

  /** Derive the native collateral custody vault. */
  vault(): PublicKey {
    return this.derive([SolanaCollateralSeed.vault])
  }

  /** Derive a position after the request's token code has passed u64 validation. */
  position(depositor: PublicKey, tokenCode: bigint): PublicKey {
    return this.derive([
      SolanaCollateralSeed.position,
      depositor.toBuffer(),
      new BN(tokenCode.toString()).toArrayLike(Buffer, "le", TokenCodeBytes)
    ])
  }
}
