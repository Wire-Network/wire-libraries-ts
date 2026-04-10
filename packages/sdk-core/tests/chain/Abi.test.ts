import { ABI } from "@wireio/sdk-core/chain/Abi"
import { ABIDecoder } from "@wireio/sdk-core/serializer/Decoder"
import { ABIEncoder } from "@wireio/sdk-core/serializer/Encoder"
import { Bytes } from "@wireio/sdk-core/chain/Bytes"

// Tests for the wire-sysio binary format adopted in PR #288 (table_id
// namespace isolation). The on-wire shape of table_def changed: `name`
// widened from sysio::name (uint64) to a length-prefixed string, and
// table_id (uint16) + secondary_indexes (vector<index_def>) were
// appended. abi_def also gained a trailing protobuf_types extension.

function encodeAbi(abi: ABI): Uint8Array {
  const encoder = new ABIEncoder()
  abi.toABI(encoder)
  return encoder.getData()
}

function decodeAbi(bytes: Uint8Array): ABI {
  const decoder = new ABIDecoder(bytes)
  return ABI.fromABI(decoder)
}

describe("ABI", () => {
  describe("table_def binary format (wire-sysio PR #288)", () => {
    test("round-trips a table with table_id and empty secondary_indexes", () => {
      const original = new ABI({
        version: "sysio::abi/1.2",
        structs: [
          {
            name: "account",
            base: "",
            fields: [{ name: "balance", type: "asset" }]
          }
        ],
        tables: [
          {
            name: "accounts",
            index_type: "i64",
            key_names: ["scope", "primary_key"],
            key_types: ["name", "uint64"],
            type: "account",
            table_id: 12345,
            secondary_indexes: []
          }
        ]
      })

      const bytes = encodeAbi(original)
      const decoded = decodeAbi(bytes)

      expect(decoded.tables).toHaveLength(1)
      const decodedTable = decoded.tables[0]
      expect(decodedTable.name).toBe("accounts")
      expect(decodedTable.index_type).toBe("i64")
      expect(decodedTable.key_names).toEqual(["scope", "primary_key"])
      expect(decodedTable.key_types).toEqual(["name", "uint64"])
      expect(decodedTable.type).toBe("account")
      expect(decodedTable.table_id).toBe(12345)
      expect(decodedTable.secondary_indexes).toEqual([])
    })

    test("round-trips a long table name (>12 chars) — the whole reason name was widened", () => {
      const original = new ABI({
        tables: [
          {
            name: "a-very-long-table-name",
            index_type: "i64",
            key_names: ["pk"],
            key_types: ["uint64"],
            type: "row",
            table_id: 7,
            secondary_indexes: []
          }
        ]
      })

      const decoded = decodeAbi(encodeAbi(original))
      expect(decoded.tables[0].name).toBe("a-very-long-table-name")
      expect(decoded.tables[0].table_id).toBe(7)
    })

    test("round-trips secondary_indexes with checksum256 key_type", () => {
      const original = new ABI({
        tables: [
          {
            name: "users",
            index_type: "i64",
            key_names: ["scope", "id"],
            key_types: ["name", "uint64"],
            type: "user",
            table_id: 100,
            secondary_indexes: [
              { name: "byowner", key_type: "name", table_id: 200 },
              { name: "bybalance", key_type: "uint64", table_id: 201 },
              { name: "byhash", key_type: "checksum256", table_id: 202 }
            ]
          }
        ]
      })

      const decoded = decodeAbi(encodeAbi(original))
      const t = decoded.tables[0]
      expect(t.secondary_indexes).toHaveLength(3)
      expect(t.secondary_indexes![0]).toEqual({
        name: "byowner",
        key_type: "name",
        table_id: 200
      })
      expect(t.secondary_indexes![1]).toEqual({
        name: "bybalance",
        key_type: "uint64",
        table_id: 201
      })
      expect(t.secondary_indexes![2]).toEqual({
        name: "byhash",
        key_type: "checksum256",
        table_id: 202
      })
    })

    test("table_id 0 is preserved (the default for hand-built tables)", () => {
      const original = new ABI({
        tables: [
          {
            name: "t",
            index_type: "i64",
            key_names: [],
            key_types: [],
            type: "row",
            table_id: 0,
            secondary_indexes: []
          }
        ]
      })

      const decoded = decodeAbi(encodeAbi(original))
      expect(decoded.tables[0].table_id).toBe(0)
    })

    test("table_id 65535 (max uint16) round-trips correctly", () => {
      const original = new ABI({
        tables: [
          {
            name: "t",
            index_type: "i64",
            key_names: [],
            key_types: [],
            type: "row",
            table_id: 65535,
            secondary_indexes: []
          }
        ]
      })

      const decoded = decodeAbi(encodeAbi(original))
      expect(decoded.tables[0].table_id).toBe(65535)
    })

    test("missing table_id defaults to 0 on encode", () => {
      // Hand-built ABIs may omit table_id; the encoder defaults to 0
      // and the decoder reads back 0.
      const original = new ABI({
        tables: [
          {
            name: "t",
            index_type: "i64",
            key_names: [],
            key_types: [],
            type: "row"
          }
        ]
      })

      const decoded = decodeAbi(encodeAbi(original))
      expect(decoded.tables[0].table_id).toBe(0)
      expect(decoded.tables[0].secondary_indexes).toEqual([])
    })
  })

  describe("abi_def trailing protobuf_types extension (wire-sysio)", () => {
    test("decoder skips a protobuf_types field appended after enums", () => {
      // Build an encoded ABI manually that includes a protobuf_types
      // string after the enums section. The parser should consume it
      // without error and not affect the rest of the decoded ABI.
      const original = new ABI({
        enums: [
          {
            name: "color",
            type: "uint8",
            values: [
              { name: "red", value: 0 },
              { name: "green", value: 1 }
            ]
          }
        ]
      })
      const bytes = encodeAbi(original)
      // The encoder writes an empty protobuf_types string at the end —
      // verify the decoder consumes it cleanly and produces the same ABI.
      const decoded = decodeAbi(bytes)
      expect(decoded.enums).toHaveLength(1)
      expect(decoded.enums[0].name).toBe("color")
      expect(decoded.enums[0].values).toHaveLength(2)
    })

    test("encoder always emits protobuf_types (empty string by default)", () => {
      // The encoded form should end with the varint-prefixed empty string
      // for protobuf_types: 0x00 (length 0). Verify the last byte is 0x00.
      const abi = new ABI({})
      const bytes = encodeAbi(abi)
      expect(bytes[bytes.length - 1]).toBe(0x00)
    })
  })

  describe("end-to-end ABI round-trip", () => {
    test("multi-table ABI with structs, actions, secondary indexes", () => {
      const original = new ABI({
        version: "sysio::abi/1.2",
        types: [{ new_type_name: "account_name", type: "name" }],
        structs: [
          {
            name: "transfer",
            base: "",
            fields: [
              { name: "from", type: "account_name" },
              { name: "to", type: "account_name" },
              { name: "quantity", type: "asset" },
              { name: "memo", type: "string" }
            ]
          },
          {
            name: "account",
            base: "",
            fields: [{ name: "balance", type: "asset" }]
          },
          {
            name: "user",
            base: "",
            fields: [
              { name: "id", type: "uint64" },
              { name: "owner", type: "name" }
            ]
          }
        ],
        actions: [
          { name: "transfer", type: "transfer", ricardian_contract: "" }
        ],
        tables: [
          {
            name: "accounts",
            index_type: "i64",
            key_names: ["scope", "sym_code"],
            key_types: ["name", "uint64"],
            type: "account",
            table_id: 1,
            secondary_indexes: []
          },
          {
            name: "users",
            index_type: "i64",
            key_names: ["scope", "id"],
            key_types: ["name", "uint64"],
            type: "user",
            table_id: 2,
            secondary_indexes: [
              { name: "byowner", key_type: "name", table_id: 100 }
            ]
          }
        ]
      })

      const decoded = decodeAbi(encodeAbi(original))
      expect(decoded.version).toBe("sysio::abi/1.2")
      expect(decoded.types).toHaveLength(1)
      expect(decoded.structs).toHaveLength(3)
      expect(decoded.actions).toHaveLength(1)
      expect(decoded.tables).toHaveLength(2)
      expect(decoded.tables[0].name).toBe("accounts")
      expect(decoded.tables[0].table_id).toBe(1)
      expect(decoded.tables[1].name).toBe("users")
      expect(decoded.tables[1].table_id).toBe(2)
      expect(decoded.tables[1].secondary_indexes).toHaveLength(1)
      expect(decoded.tables[1].secondary_indexes![0].name).toBe("byowner")
    })
  })
})
