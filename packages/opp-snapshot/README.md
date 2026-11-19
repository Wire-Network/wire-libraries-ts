# @wireio/opp-snapshot

The pre-launch Ethereum OPP assertion stream, replayed into staker and
purchaser balances: the snapshot the depot's launch import is built from.

`buildOppSnapshot` reads the pre-launch OPP contract's `OPPMessage` logs
straight from any Ethereum node, decodes each message's assertions, recovers
every staker's compressed public key from a transaction they signed, and
returns the same `/opp/balances` shape the capital indexer serves. The
indexer and the wire-tools-ts harness run this one computation.

```ts
import { OppConstants, buildOppSnapshot } from "@wireio/opp-snapshot"

const { snapshot } = await buildOppSnapshot({
  rpc: "https://ethereum.example/rpc",
  oppAddress: OppConstants.MainnetOppContractAddress,
  fromBlock: 0
})
```

The building blocks are exported too: `decodeOppLog` / `decodeLogsToRows`
(the ABI event and the packed assertion payloads), `sortAssertionRows` and
`computeBalances` (the replay), `recoverActorPubkeys` and `toSnapshot`.
