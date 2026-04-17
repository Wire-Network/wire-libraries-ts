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
      // Verify that encoding an ABI with populated enums still ends
      // with a length-prefixed empty protobuf_types string. Using an
      // ABI with real content means the final two bytes are forced to
      // be the varuint(0) length prefix + the empty string (both
      // 0x00), rather than coincidentally 0x00 from another field. The
      // golden-bytes test below pins the exact byte layout for a
      // minimal ABI; this test exists as a sanity check that the
      // protobuf_types trailer is present regardless of content, and
      // that the round-trip preserves the rest of the ABI.
      const abi = new ABI({
        enums: [
          {
            name: "color",
            type: "uint8",
            values: [{ name: "red", value: 0 }]
          }
        ]
      })
      const bytes = encodeAbi(abi)
      expect(bytes.length).toBeGreaterThan(2)
      expect(bytes[bytes.length - 1]).toBe(0x00)
      // Round-trip must preserve the enums so we know the trailing
      // 0x00 wasn't consumed as part of an earlier field.
      const decoded = decodeAbi(bytes)
      expect(decoded.enums).toHaveLength(1)
      expect(decoded.enums[0].name).toBe("color")
      expect(decoded.enums[0].values).toHaveLength(1)
    })

    test("encoder rejects table_id outside uint16 range", () => {
      const tooBig = new ABI({
        tables: [
          {
            name: "t",
            index_type: "i64",
            key_names: [],
            key_types: [],
            type: "row",
            table_id: 65536,
            secondary_indexes: []
          }
        ]
      })
      expect(() => encodeAbi(tooBig)).toThrow(/uint16/)

      const negative = new ABI({
        tables: [
          {
            name: "t",
            index_type: "i64",
            key_names: [],
            key_types: [],
            type: "row",
            table_id: -1,
            secondary_indexes: []
          }
        ]
      })
      expect(() => encodeAbi(negative)).toThrow(/uint16/)
    })

    test("encoder rejects secondary_index table_id outside uint16 range", () => {
      const abi = new ABI({
        tables: [
          {
            name: "t",
            index_type: "i64",
            key_names: [],
            key_types: [],
            type: "row",
            table_id: 0,
            secondary_indexes: [
              { name: "bad", key_type: "name", table_id: 70000 }
            ]
          }
        ]
      })
      expect(() => encodeAbi(abi)).toThrow(/uint16/)
    })

    test("decoder drains multiple trailing string-typed extensions for sysio::abi/1.x", () => {
      // Simulate a future wire-sysio release that appends additional
      // string-typed extension fields after protobuf_types. The decoder
      // must not choke on the extra data (forward-compat within the
      // sysio::abi/1.x line).
      const abi = new ABI({
        version: "sysio::abi/1.2",
        tables: []
      })
      const baseBytes = encodeAbi(abi)
      // Append two extra length-prefixed strings: "foo" and "bar".
      const extra = new Uint8Array([
        0x03, 0x66, 0x6f, 0x6f, // "foo"
        0x03, 0x62, 0x61, 0x72 // "bar"
      ])
      const combined = new Uint8Array(baseBytes.length + extra.length)
      combined.set(baseBytes, 0)
      combined.set(extra, baseBytes.length)

      // Should decode cleanly without throwing.
      const decoded = decodeAbi(combined)
      expect(decoded.version).toBe("sysio::abi/1.2")
      expect(decoded.tables).toHaveLength(0)
    })

    test("decoder does NOT drain trailing bytes for unknown ABI versions", () => {
      // Version-gated safety: when the decoded ABI version is outside
      // the sysio::abi/1.x line (e.g. a future sysio::abi/2.0), the
      // drain loop is skipped so a non-string trailing extension can
      // not be mis-parsed as a string. Previously-required fields
      // parsed earlier are still populated correctly; trailing bytes
      // are simply ignored. This test guarantees no throw and no
      // silent corruption of the populated fields.
      const abi = new ABI({
        version: "sysio::abi/2.0",
        tables: []
      })
      const baseBytes = encodeAbi(abi)
      // Append bytes that would mis-parse as a giant string if drained
      // (0xff is varuint continuation, leading to a multi-byte length
      // prefix). A blind drain would hang or throw on underflow; with
      // the version gate, these bytes are left untouched.
      const extra = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0x01])
      const combined = new Uint8Array(baseBytes.length + extra.length)
      combined.set(baseBytes, 0)
      combined.set(extra, baseBytes.length)

      const decoded = decodeAbi(combined)
      expect(decoded.version).toBe("sysio::abi/2.0")
      expect(decoded.tables).toHaveLength(0)
    })

    test("golden bytes: minimal single-table ABI matches expected layout", () => {
      // Fixture asserting byte-for-byte layout matches the C++ wire-sysio
      // table_def struct in libraries/chain/include/sysio/chain/abi_def.hpp.
      // Keeping this as a pinned vector catches silent drift in field
      // order / widths without running an integration build.
      const abi = new ABI({
        version: "v",
        tables: [
          {
            name: "T",
            index_type: "i",
            key_names: [],
            key_types: [],
            type: "r",
            table_id: 0x1234,
            secondary_indexes: []
          }
        ]
      })
      const bytes = encodeAbi(abi)
      const expected = new Uint8Array([
        0x01, 0x76, // version "v"
        0x00, // types
        0x00, // structs
        0x00, // actions
        0x01, // tables.length = 1
        0x01, 0x54, // table[0].name = "T"
        0x01, 0x69, // table[0].index_type = "i"
        0x00, // key_names
        0x00, // key_types
        0x01, 0x72, // type = "r"
        0x34, 0x12, // table_id = 0x1234 LE
        0x00, // secondary_indexes.length = 0
        0x00, // ricardian_clauses
        0x00, // error_messages
        0x00, // extensions
        0x00, // variants
        0x00, // action_results
        0x00, // enums
        0x00 // protobuf_types = ""
      ])
      expect(Array.from(bytes)).toEqual(Array.from(expected))
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
