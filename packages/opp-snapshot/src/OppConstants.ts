import { id } from "ethers"

/** Constants of the pre-launch Ethereum OPP stream, and the defaults of a snapshot build. */
export namespace OppConstants {
  /** The pre-launch OPP contract on Ethereum mainnet: the default source of the assertion stream. */
  export const MainnetOppContractAddress = "0x5e1135cF8987268a3e7F68551558Ae92c454429f"
  /** The `OPPMessage` event the pre-launch OPP contract emits: a header tuple and a payload tuple. */
  export const OppMessageEventSignature =
    "OPPMessage((bytes32,bytes32,bytes32,uint64),(uint8,uint8,(uint16,bytes)[]))"
  /** keccak256 of {@link OppMessageEventSignature}: the event's `topic0`. */
  export const OppMessageTopic0 = id(OppMessageEventSignature)
  /** Fixed-point scale of the liqETH index carried by the assertions (1e27). */
  export const IndexPrecision = 10n ** 27n
  /** Fixed-point scale pretoken yield is accumulated in before it is floored out (1e27). */
  export const YieldPrecision = 10n ** 27n
  /** Blocks per `eth_getLogs` call when a build does not choose its own range. */
  export const DefaultLogBlockRange = 2_000
  /** Concurrent RPC reads (block timestamps, transactions) when a build does not choose its own. */
  export const DefaultConcurrency = 5
}
