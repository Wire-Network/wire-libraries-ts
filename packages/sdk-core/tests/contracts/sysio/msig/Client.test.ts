import { Checksum256 } from "@wireio/sdk-core/chain/Checksum"
import { Serializer } from "@wireio/sdk-core/serializer"
import { APIError, Name, contracts } from "@wireio/sdk-core"

const { MsigClient, MsigProposal, decodeReadOnlyProposalReturn } =
  contracts.sysio.msig

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
  test("preserves an HTTP-200 execution exception instead of reporting a missing return", () => {
    expect(() =>
      decodeReadOnlyProposalReturn({
        processed: {
          except: {
            code: 3080004,
            name: "tx_cpu_usage_exceeded",
            message: "transaction exceeded CPU limit",
            stack: []
          }
        }
      })
    ).toThrow("tx_cpu_usage_exceeded: transaction exceeded CPU limit")
  })
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
  test.each(["failed", "missing", "unsupported"])(
    "reads scoped rows while ABI detection is %s and retries after recovery",
    async state => {
      const proposal = { proposal_name: "upgrade1", packed_transaction: "" },
        approval = {
          version: 1,
          proposal_name: "upgrade1",
          requested_approvals: [],
          provided_approvals: []
        },
        getAbi = jest.fn(async () => {
          if (state === "failed") throw new Error("ABI service unavailable")
          return { abi: state === "missing" ? null : {} }
        }),
        tableRows = jest.fn(async (params: any) => {
          if (params.lower_bound != null) {
            // A deployed KV table refuses legacy Name bounds.
            expect(params.lower_bound).toBe(
              JSON.stringify({
                proposal_name: Name.from("upgrade1").value.toString()
              })
            )
          }
          return {
            rows:
              String(params.table) === "approvals2"
                ? [{ ...approval, proposal_name: "aaa" }, approval]
                : [
                    { ...proposal, proposal_name: "aaa" },
                    proposal,
                    { ...proposal, proposal_name: "zzz" }
                  ],
            more: false
          }
        }),
        client = new MsigClient({
          client: {
            v1: { chain: { get_abi: getAbi, get_table_rows: tableRows } }
          } as any
        })

      const approvals = await client.getApprovals("alice", "upgrade1")
      expect(approvals?.kind).toBe("approvals2")
      expect(approvals?.approvals.proposal_name.toString()).toBe("upgrade1")
      expect(
        (
          await client.listProposals("alice", {
            lowerBound: "upgrade1",
            upperBound: "upgrade1",
            limit: 1
          })
        ).map(row => row.proposal_name.toString())
      ).toEqual(["upgrade1"])
      expect(getAbi).toHaveBeenCalledTimes(2)
      tableRows.mock.calls.forEach(([params]) => {
        expect(params).not.toHaveProperty("lower_bound")
        expect(params).not.toHaveProperty("upper_bound")
        expect(params.limit).toBeGreaterThan(1)
      })

      getAbi.mockResolvedValue({ abi: chunkedAbi() })
      await client.getApprovals("alice", "upgrade1")
      expect(await client.getProfile()).toBe("chunked-v2")
      expect(getAbi).toHaveBeenCalledTimes(3)
      expect(tableRows.mock.calls.at(-1)?.[0].lower_bound).toBe(
        JSON.stringify({
          proposal_name: Name.from("upgrade1").value.toString()
        })
      )
    }
  )

  test("shares in-flight capability detection but never caches an unknown result", async () => {
    const getAbi = jest
        .fn()
        .mockRejectedValueOnce(new Error("ABI service unavailable"))
        .mockResolvedValue({ abi: chunkedAbi() }),
      client = new MsigClient({
        client: { v1: { chain: { get_abi: getAbi } } } as any
      })
    const results = await Promise.all([
      client.getCapabilities(),
      client.getCapabilities()
    ])
    expect(results.map(result => result.profile)).toEqual([
      "unknown",
      "unknown"
    ])
    expect(getAbi).toHaveBeenCalledTimes(1)
    expect((await client.getCapabilities()).profile).toBe("chunked-v2")
    expect((await client.getCapabilities()).profile).toBe("chunked-v2")
    expect(getAbi).toHaveBeenCalledTimes(2)
  })

  test.each(["parse_error_exception", "bad_cast_exception", "RPC unavailable"])(
    "preserves table failures: %s",
    async message => {
      const error = new Error(message),
        tableRows = jest.fn(async () => {
          throw error
        }),
        client = new MsigClient({
          client: {
            v1: {
              chain: {
                get_abi: jest.fn(async () => ({ abi: chunkedAbi() })),
                get_table_rows: tableRows
              }
            }
          } as any
        })
      await expect(
        client.listProposals("alice", { lowerBound: "first" })
      ).rejects.toBe(error)
      await expect(client.getApprovals("alice", "first")).rejects.toBe(error)
      expect(tableRows).toHaveBeenCalledTimes(2)
    }
  )
  test.each([
    new Error("read-only transactions execution not enabled"),
    new APIError("/v1/chain/send_read_only_transaction", {
      status: 404,
      text: "unknown endpoint",
      headers: {}
    })
  ])(
    "falls back from unavailable read-only getproposal to chunk table assembly",
    async failure => {
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
                  throw failure
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
      expect(
        tableRows.mock.calls.some(
          ([request]) =>
            String(request.table) === "approvals2" &&
            request.lower_bound ===
              JSON.stringify({
                proposal_name: Name.from("largeprop").value.toString()
              })
        )
      ).toBe(true)
    }
  )

  test.each([false, true])(
    "encodes bounded proposal queries for the detected profile (chunked=%s)",
    async chunked => {
      const tableRows = jest.fn(async (_request: any) => ({
          rows: [],
          more: false
        })),
        abi = chunkedAbi(),
        client = new MsigClient({
          client: {
            v1: {
              chain: {
                get_abi: jest.fn(async () => ({
                  abi: chunked
                    ? abi
                    : {
                        ...abi,
                        actions: abi.actions.filter(
                          action => action.name !== "getproposal"
                        ),
                        structs: abi.structs.map(struct =>
                          struct.name === "proposal"
                            ? { ...struct, fields: struct.fields.slice(0, 2) }
                            : struct
                        )
                      }
                })),
                get_table_rows: tableRows
              }
            }
          } as any
        })
      await client.listProposals("alice", {
        lowerBound: "first",
        upperBound: "last"
      })
      const request = tableRows.mock.calls[0][0]
      expect(String(request.scope)).toBe("alice")
      expect(String(request.lower_bound)).toBe(
        chunked
          ? JSON.stringify({
              proposal_name: Name.from("first").value.toString()
            })
          : "first"
      )
      expect(String(request.upper_bound)).toBe(
        chunked
          ? JSON.stringify({
              proposal_name: Name.from("last").value.toString()
            })
          : "last"
      )
    }
  )

  test.each([
    new Error("CPU limit exceeded at /v1/chain/send_read_only_transaction"),
    new APIError("/v1/chain/send_read_only_transaction", {
      status: 503,
      text: "unavailable",
      headers: {}
    })
  ])(
    "does not hide a real read-only execution or transport failure",
    async failure => {
      const tables = jest.fn(),
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
                  throw failure
                }),
                get_table_rows: tables
              }
            }
          } as any
        })
      await expect(client.getProposal("alice", "largeprop")).rejects.toBe(
        failure
      )
      expect(tables).not.toHaveBeenCalled()
    }
  )
})
