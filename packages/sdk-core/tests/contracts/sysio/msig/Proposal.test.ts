import { Checksum256 } from "@wireio/sdk-core/chain/Checksum"
import { contracts } from "@wireio/sdk-core"
import { getLogger } from "@wireio/shared"
import { hexToArray } from "@wireio/sdk-core/Utils"
import {
  createEmptyTransaction,
  EmptyTransactionVaruint32Offsets,
  encodeEmptyTransaction,
  replaceByte
} from "../../../support/transactions.js"

const {
  capabilitiesFromAbi,
  createProposalDetail,
  MsigProposal,
  unpackProposalTransaction
} = contracts.sysio.msig

const packedTransaction = new Uint8Array([1, 2, 3, 4])
const PROPOSAL_NAME = "upgrade1"
const PADDED_ZERO = hexToArray("8000")
const TRAILING_BYTE = Uint8Array.from([0x00])
const NON_CANONICAL_VARUINT32_MESSAGE =
  /varuint32 is not in its shortest encoding/
const TRAILING_BYTES_MESSAGE = /Unread bytes after the packed transaction/
const UNPACK_FAILED_LOG_MESSAGE =
  "Multisig proposal %s transaction did not unpack: %s"

/** Spy on the proposal module's logger without letting warnings print. */
function spyOnProposalWarnings() {
  return jest
    .spyOn(
      getLogger(
        require.resolve("@wireio/sdk-core/contracts/sysio/msig/Proposal")
      ),
      "warn"
    )
    .mockImplementation(() => {})
}

/** Create a proposal row holding `packed` as its transaction. */
function createProposal(packed: Uint8Array) {
  return MsigProposal.from({
    proposal_name: PROPOSAL_NAME,
    packed_transaction: packed
  })
}

/** Create the proposal detail of a proposal holding `packed`, without ABI capabilities. */
function createDetail(packed: Uint8Array) {
  return createProposalDetail({
    proposer: "alice",
    proposal: createProposal(packed),
    approvals: null,
    capabilities: null,
    readStrategy: null
  })
}

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

describe("proposal transaction unpacking", () => {
  test("unpacks a canonical proposal transaction", () => {
    const packed = encodeEmptyTransaction()

    expect(
      unpackProposalTransaction(createProposal(packed)).equals(
        createEmptyTransaction()
      )
    ).toBe(true)
    expect(
      createDetail(packed).transaction.equals(createEmptyTransaction())
    ).toBe(true)
  })

  test.each(EmptyTransactionVaruint32Offsets)(
    "rejects a proposal with a zero-padded %s",
    (_, offset) => {
      const packed = replaceByte(encodeEmptyTransaction(), offset, PADDED_ZERO)

      expect(() => unpackProposalTransaction(createProposal(packed))).toThrow(
        NON_CANONICAL_VARUINT32_MESSAGE
      )
      expect(createDetail(packed).transaction).toBeNull()
    }
  )

  test("rejects a proposal with bytes after the transaction", () => {
    const packed = Uint8Array.from([
      ...encodeEmptyTransaction(),
      ...TRAILING_BYTE
    ])

    expect(() => unpackProposalTransaction(createProposal(packed))).toThrow(
      TRAILING_BYTES_MESSAGE
    )
    expect(createDetail(packed).transaction).toBeNull()
  })

  test("logs why a non-canonical proposal does not unpack", () => {
    const warn = spyOnProposalWarnings()

    try {
      createDetail(
        replaceByte(
          encodeEmptyTransaction(),
          EmptyTransactionVaruint32Offsets[0][1],
          PADDED_ZERO
        )
      )

      expect(warn).toHaveBeenCalledWith(
        UNPACK_FAILED_LOG_MESSAGE,
        PROPOSAL_NAME,
        expect.stringMatching(NON_CANONICAL_VARUINT32_MESSAGE)
      )
    } finally {
      warn.mockRestore()
    }
  })

  test("logs why an undecodable proposal does not unpack", () => {
    const warn = spyOnProposalWarnings()

    try {
      createDetail(packedTransaction)

      expect(warn).toHaveBeenCalledWith(
        UNPACK_FAILED_LOG_MESSAGE,
        PROPOSAL_NAME,
        expect.not.stringMatching(NON_CANONICAL_VARUINT32_MESSAGE)
      )
    } finally {
      warn.mockRestore()
    }
  })
})
