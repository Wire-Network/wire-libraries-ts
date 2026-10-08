// Extracted without changes from Wire-Network/wire-sysio at
// 517de37142660624904001082ac34cfed9afeccf: contracts/sysio.synd/sysio.synd.abi.
// Only the setconfig action and its struct are needed by this regression.
export default {
  version: "sysio::abi/1.2",
  structs: [
    {
      name: "setconfig",
      base: "",
      fields: [
        {
          name: "chain_code",
          type: "slug_name"
        },
        {
          name: "token_code",
          type: "slug_name"
        },
        {
          name: "synd_fee_bps",
          type: "uint32"
        },
        {
          name: "desynd_fee_bps",
          type: "uint32"
        },
        {
          name: "synd_burst",
          type: "uint64"
        },
        {
          name: "synd_refill",
          type: "uint64"
        },
        {
          name: "desynd_burst",
          type: "uint64"
        },
        {
          name: "desynd_refill",
          type: "uint64"
        },
        {
          name: "window_sec",
          type: "uint32"
        },
        {
          name: "bounty",
          type: "uint64"
        },
        {
          name: "challenge_extra",
          type: "uint64"
        },
        {
          name: "min_desyndicate",
          type: "uint64"
        }
      ]
    }
  ],
  actions: [
    {
      name: "setconfig",
      type: "setconfig",
      ricardian_contract: ""
    }
  ]
}
