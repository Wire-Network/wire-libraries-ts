import { Checksum256 } from "@wireio/sdk-core/chain/Checksum"
import { contracts } from "@wireio/sdk-core"

const { capabilitiesFromAbi, createProposalDetail, MsigProposal } = contracts.sysio.msig

const packedTransaction = new Uint8Array([1, 2, 3, 4])

function chunkedCapabilities() {
  return capabilitiesFromAbi({
    abi: {
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
  } as any)
}

describe("proposal details", () => {
  test("marks proposal hashes verified when packed transaction matches trx_hash", () => {
    const proposal = MsigProposal.from({
        proposal_name: "upgrade1",
        packed_transaction: packedTransaction,
        trx_hash: Checksum256.hash(packedTransaction)
      }),
      detail = createProposalDetail({
        proposer: "alice",
        proposal,
        approvals: null,
        capabilities: chunkedCapabilities(),
        readStrategy: null
      })

    expect(detail.profile).toBe("chunked-v2")
    expect(detail.hash.status).toBe("verified")
    expect(detail.hash.matches).toBe(true)
    expect(detail.features.readOnlyGetProposal).toBe(true)
  })

  test("marks legacy proposal hashes unavailable without treating them as failures", () => {
    const proposal = MsigProposal.from({
        proposal_name: "upgrade1",
        packed_transaction: packedTransaction
      }),
      capabilities = capabilitiesFromAbi({
        abi: {
          actions: [
            { name: "propose", type: "propose" },
            { name: "approve", type: "approve" },
            { name: "unapprove", type: "unapprove" },
            { name: "cancel", type: "cancel" },
            { name: "exec", type: "exec" },
            { name: "invalidate", type: "invalidate" }
          ],
          tables: [
            { name: "proposal", type: "proposal" },
            { name: "approvals2", type: "approvals2" },
            { name: "approvals", type: "approvals" },
            { name: "invals", type: "invals" }
          ],
          structs: [
            {
              name: "proposal",
              fields: [
                { name: "proposal_name", type: "name" },
                { name: "packed_transaction", type: "bytes" }
              ]
            },
            {
              name: "approve",
              fields: [
                { name: "proposer", type: "name" },
                { name: "proposal_name", type: "name" },
                { name: "level", type: "permission_level" }
              ]
            }
          ]
        }
      } as any),
      detail = createProposalDetail({
        proposer: "alice",
        proposal,
        approvals: null,
        capabilities,
        readStrategy: null
      })

    expect(detail.profile).toBe("legacy")
    expect(detail.hash.status).toBe("unavailable")
    expect(detail.hash.reason).toBe("profile-does-not-support-hash")
    expect(detail.hash.matches).toBeNull()
  })
})
