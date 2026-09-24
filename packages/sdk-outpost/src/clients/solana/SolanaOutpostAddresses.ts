import { PublicKey } from "@solana/web3.js"

const SolanaOutpostSeed = {
  config: Buffer.from("outpost_config"),
  outboundMessageBuffer: Buffer.from("outbound_message_buffer")
} as const

/** Shared outpost accounts used by distinct reserve and collateral custody paths. */
export class SolanaOutpostAddresses {
  /** Bind address derivation to one verified program deployment. */
  constructor(private readonly programId: PublicKey) {}

  /** Derive the singleton outpost configuration PDA. */
  outpostConfig(): PublicKey {
    return this.derive([SolanaOutpostSeed.config])
  }

  /** Derive the singleton outbound message-buffer PDA. */
  outboundMessageBuffer(): PublicKey {
    return this.derive([SolanaOutpostSeed.outboundMessageBuffer])
  }

  /** Derive a program-owned account using its producer-defined seeds. */
  protected derive(seeds: Buffer[]): PublicKey {
    return PublicKey.findProgramAddressSync(seeds, this.programId)[0]
  }
}
