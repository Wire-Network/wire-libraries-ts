import { Checksum256 } from "@wireio/sdk-core/chain/Checksum"
import { Serializer } from "@wireio/sdk-core/serializer"
import { Msig } from "@wireio/sdk-core"

const { MsigClient, MsigProposal, decodeReadOnlyProposalReturn } = Msig

function chunkedAbi(): any {
  return {
    actions: [
      { name: "propose", type: "propose" },
      { name: "approve", type: "approve" },
      { name: "unapprove", type: "unapprove" },
      { name: "cancel", type: "cancel" },
      { name: "exec", type: "exec" },
      { name: "invalidate", type: "invalidate" },
      { name: "getproposal", type: "getproposal" }
    ],
    tables: [
      { name: "proposal", type: "proposal" },
      { name: "approvals2", type: "approvals2" },
      { name: "approvals", type: "approvals" },
      { name: "invals", type: "invals" },
      { name: "propchunks", type: "propchunks" }
    ],
    action_results: [{ name: "getproposal", result_type: "proposal" }],
    structs: [
      {
        name: "proposal",
        fields: [
          { name: "proposal_name", type: "name" },
          { name: "packed_transaction", type: "bytes" },
          { name: "earliest_exec_time", type: "time_point" },
          { name: "chunk_count", type: "uint32" },
          { name: "total_size", type: "uint32" },
          { name: "trx_hash", type: "checksum256" }
        ]
      },
      {
        name: "approve",
        fields: [
          { name: "proposer", type: "name" },
          { name: "proposal_name", type: "name" },
          { name: "level", type: "permission_level" },
          { name: "proposal_hash", type: "checksum256$" }
        ]
      }
    ]
  }
}

describe("read-only proposal return decoding", () => {
  test("prefers decoded return_value_data when present", () => {
    const proposal = {
        proposal_name: "upgrade1",
        packed_transaction: "",
        earliest_exec_time: null,
        chunk_count: 0,
        total_size: 0,
        trx_hash: Checksum256.hash(new Uint8Array()).toString()
      },
      decoded = decodeReadOnlyProposalReturn({
        processed: {
          action_traces: [
            {
              act: { name: "getproposal" },
              return_value_hex_data: "00",
              return_value_data: proposal
            }
          ]
        }
      })

    expect(decoded.proposal_name.toString()).toBe("upgrade1")
    expect(decoded.packed_transaction.length).toBe(0)
  })

  test("falls back to ABI hex return data", () => {
    const proposal = MsigProposal.from({
        proposal_name: "upgrade2",
        packed_transaction: "",
        earliest_exec_time: null,
        chunk_count: 0,
        total_size: 0,
        trx_hash: Checksum256.hash(new Uint8Array())
      }),
      hex = Serializer.encode({ object: proposal }).hexString,
      decoded = decodeReadOnlyProposalReturn({
        processed: {
          action_traces: [
            {
              act: { name: "getproposal" },
              return_value_hex_data: hex
            }
          ]
        }
      })

    expect(decoded.proposal_name.toString()).toBe("upgrade2")
    expect(decoded.trx_hash!.equals(proposal.trx_hash!)).toBe(true)
  })
})

describe("MsigClient", () => {
  test("falls back from read-only getproposal to chunk table assembly", async () => {
    const packed = new Uint8Array([1, 2, 3, 4]),
      tableRows = jest.fn(async (params: any) => {
        if (String(params.table) === "proposal") {
          return {
            rows: [
              {
                proposal_name: "largeprop",
                packed_transaction: "",
                earliest_exec_time: null,
                chunk_count: 2,
                total_size: 4,
                trx_hash: Checksum256.hash(packed).toString()
              }
            ],
            more: false
          }
        }

        if (String(params.table) === "propchunks") {
          return {
            rows: [
              { proposal_name: "largeprop", chunk_index: 1, data: "0304" },
              { proposal_name: "largeprop", chunk_index: 0, data: "0102" }
            ],
            more: false
          }
        }

        if (String(params.table) === "approvals2") {
          return {
            rows: [
              {
                version: 1,
                proposal_name: "largeprop",
                requested_approvals: [],
                provided_approvals: [
                  {
                    level: { actor: "bob", permission: "active" },
                    time: "2026-06-16T15:00:00.000"
                  }
                ]
              }
            ],
            more: false
          }
        }

        return { rows: [], more: false }
      }),
      client = new MsigClient({
        client: {
          v1: {
            chain: {
              get_abi: jest.fn(async () => ({ abi: chunkedAbi() })),
              get_info: jest.fn(async () => ({
                getTransactionHeader: () => ({
                  expiration: "2026-06-16T16:00:00",
                  ref_block_num: 1,
                  ref_block_prefix: 2
                })
              })),
              send_read_only_transaction: jest.fn(async () => {
                throw new Error("read-only transactions execution not enabled")
              }),
              get_table_rows: tableRows
            }
          }
        } as any
      }),
      detail = await client.getProposalDetail("alice", "largeprop")

    expect(detail.profile).toBe("chunked-v2")
    expect(detail.readStrategy).toBe("chunk-table")
    expect(detail.proposal.packed_transaction.hexString).toBe("01020304")
    expect(detail.hash.status).toBe("verified")
    expect(detail.status.provided).toEqual(["bob@active"])
  })
})
