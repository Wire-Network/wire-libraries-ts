# Launch capability coverage

The user journeys cross two SDKs. Available bindings are not deployment, funding,
permissions or end-to-end acceptance. Keep application gates and fresh chain
checks; never restore deprecated external collateral/reserve APIs.

| Journey | SDK surface | Boundary |
| --- | --- | --- |
| Native ETH/SOL → external LIQ | Verified outpost `syndication.read/quoteDeposit/deposit` | Live limits, fees, pauses and wallet gas/rent still apply. |
| External LIQ → shadow LIQ | Outpost approval/syndication; Core `synd`, `bond`, `liq`, AuthEx tables | Source confirmation is not underwriting, bond release or spendable Wire credit. |
| Shadow LIQ → external LIQ | Core `synd.actions.desyndicate`, return/config tables | Wire irreversibility is not external delivery; exact linked destination and issuer precision matter. |
| External LIQ → native | Outpost `withdrawals.read/request/claim` for ETH and SOL | ETH needs the correct queue profile; SOL claims require owned serviceable receipts. No queue funding or validator cranks. |
| Wire swap for WIRE | Core generated `swap` actions/tables and `quoteSwap` | Single pool, exact issuer; direct-transfer output differs from internal exchange custody. |
| Add/remove LIQ/WIRE liquidity | Core generated LP actions/tables and add/remove quotes | LP shares, locked supply, fees, accrued yield and recoverable internal deposits are distinct. |
| Operator registration/collateral/recovery/pay | Core `opreg`, system producer/finalizer and claim actions | Registration is not running, scheduled or producing; earned pay is independently claimable. |
| Underwriter/batch actors | Core registry/bond/underwriting tables and generated actions | Retained enum/bindings do not establish public admission or daemon readiness. |
| Node owners | Verified BAR/1155 helpers; Core ROA/policies/claims | External registration, Wire membership, allocations and funded rewards are separate evidence. |
| Council/contract interaction | Core generated council/system action and ABI facilities | UI governance decisions, current ABI, authorization and funding remain caller-owned. |
| Existing/imported LCO positions | Core public tables/actions available in the deployed ABI | Do not assume a snapshot onboarding mechanism or infer a migration from the stories. |

`EthereumArtifacts` exposes the current outpost/liqETH catalog: Token/KeyBondManager V4,
DepositManager/StakingModule V3, WithdrawalQueue/Vault V2, YieldOracle V2 and
authorities. Existing published token/manager aliases and the original queue
remain necessary for the current cluster bootstrap; intermediate migration
implementations, old Accounting and DeepFreeze are omitted. These are verified
deployment identities, not versions for users to choose.
Raw factories support advanced integrations but do not bypass privileged roles.
`SolanaArtifacts` exposes the full published **core** program package; companion
program IDLs are not published by that producer package. Standard SPL/Token-2022
operations retain their standard libraries.

Do not copy pending backend ABI changes (kicker, AuthEx removal, transport or
withdrawal semantics) into this PR. Consume producer releases and generated Core
types once finalized; keep these changes independent of unrelated open SDK work.
The Hub's forthcoming swaps UI can use the existing typed transport plus the
[new quote/custody guide](https://github.com/Wire-Network/wire-libraries-ts/blob/master/packages/sdk-core/docs/depot-liquidity.md); this update does
not enable its transaction controls or certify live pool/bootstrap readiness.
