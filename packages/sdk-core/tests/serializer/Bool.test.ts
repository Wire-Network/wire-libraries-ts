import { Action } from "@wireio/sdk-core/chain/Action"
import { ABIDef } from "@wireio/sdk-core/chain/Abi"
import { Serializer } from "@wireio/sdk-core/serializer"

const BOOL_FALSE_BYTE = 0x00
const BOOL_TRUE_BYTE = 0x01
const BOOL_FALSE_HEX = "00"
const BOOL_TRUE_HEX = "01"
const BOOL_ARRAY_TYPE_NAME = "bool[]"
const INVALID_BOOL_VALUE_MESSAGE = /Invalid bool value/
const INVALID_FLAG_FIELD_MESSAGE = /flag<bool>: Invalid bool value/
const NONCANONICAL_BOOL_TRUE_BYTE = 0x02
const MEMO_LENGTH_BYTE = 0x05
const ACTION_ACCOUNT = "sysio"
const ACTION_NAME = "doit"
const ACTION_TYPE = "row"
const FLAG_FIELD_NAME = "flag"
const MEMO_FIELD_NAME = "memo"
const BOOL_TYPE_NAME = "bool"
const STRING_TYPE_NAME = "string"
const MEMO_VALUE = "hello"

/** Values that are neither a bool nor a bool byte value, labelled for the test name. */
const NON_BOOL_VALUES: [string, unknown][] = [
  ["the string true", "true"],
  ["the string false", "false"],
  ["the string 1", "1"],
  ["the empty string", ""],
  ["the number 2", 2],
  ["the number -1", -1],
  ["a fractional number", 0.5],
  ["NaN", Number.NaN],
  ["a bigint", BigInt(1)],
  ["an object", {}],
  ["an array", []]
]

/** Every accepted bool carrier, with the boolean it reads as. */
const BOOL_READINGS: [unknown, boolean][] = [
  [true, true],
  [false, false],
  [BOOL_TRUE_BYTE, true],
  [BOOL_FALSE_BYTE, false],
  [-0, false]
]

/** ABI fixture for decoding raw bool action payloads through the preview path. */
const ACTION_PREVIEW_ABI: ABIDef = {
  actions: [
    {
      name: ACTION_NAME,
      type: ACTION_TYPE,
      ricardian_contract: ""
    }
  ],
  structs: [
    {
      name: ACTION_TYPE,
      base: "",
      fields: [
        { name: FLAG_FIELD_NAME, type: BOOL_TYPE_NAME },
        { name: MEMO_FIELD_NAME, type: STRING_TYPE_NAME }
      ]
    }
  ]
}

/** Create raw action data with the bool byte preserved exactly. */
function createRawBoolAction(boolByte: number) {
  return Action.from({
    account: ACTION_ACCOUNT,
    name: ACTION_NAME,
    authorization: [],
    data: Uint8Array.from([
      boolByte,
      MEMO_LENGTH_BYTE,
      ...new TextEncoder().encode(MEMO_VALUE)
    ])
  })
}

/** Create encoded action data through the normal bool serializer. */
function createEncodedBoolAction(flag: unknown) {
  return Action.from(
    {
      account: ACTION_ACCOUNT,
      name: ACTION_NAME,
      authorization: [],
      data: {
        flag,
        memo: MEMO_VALUE
      }
    },
    ACTION_PREVIEW_ABI
  )
}

describe("bool serialization", () => {
  test("encodes bool values as canonical action preview bytes", () => {
    expect(createEncodedBoolAction(false).data.array[0]).toBe(BOOL_FALSE_BYTE)
    expect(createEncodedBoolAction(true).data.array[0]).toBe(BOOL_TRUE_BYTE)
  })

  test("decodes canonical false bytes as false in action previews", () => {
    const decoded = createRawBoolAction(BOOL_FALSE_BYTE).decodeData(
      ACTION_PREVIEW_ABI
    ) as Record<string, unknown>

    expect(decoded[FLAG_FIELD_NAME]).toBe(false)
    expect(decoded[MEMO_FIELD_NAME]).toBe(MEMO_VALUE)
  })

  test("decodes canonical true bytes as true in action previews", () => {
    const decoded = createRawBoolAction(BOOL_TRUE_BYTE).decodeData(
      ACTION_PREVIEW_ABI
    ) as Record<string, unknown>

    expect(decoded[FLAG_FIELD_NAME]).toBe(true)
    expect(decoded[MEMO_FIELD_NAME]).toBe(MEMO_VALUE)
  })

  test("decodes noncanonical nonzero bool bytes as true in action previews", () => {
    const decoded = createRawBoolAction(NONCANONICAL_BOOL_TRUE_BYTE).decodeData(
      ACTION_PREVIEW_ABI
    ) as Record<string, unknown>

    expect(decoded[FLAG_FIELD_NAME]).toBe(true)
    expect(decoded[MEMO_FIELD_NAME]).toBe(MEMO_VALUE)
  })
})

describe("bool encoding", () => {
  test("encodes true as 01 and false as 00", () => {
    expect(
      Serializer.encode({ object: true, type: BOOL_TYPE_NAME }).hexString
    ).toBe(BOOL_TRUE_HEX)
    expect(
      Serializer.encode({ object: false, type: BOOL_TYPE_NAME }).hexString
    ).toBe(BOOL_FALSE_HEX)
  })

  test("encodes the byte values 1 and 0, the JSON form nodeop gives bool fields", () => {
    expect(
      Serializer.encode({ object: BOOL_TRUE_BYTE, type: BOOL_TYPE_NAME })
        .hexString
    ).toBe(BOOL_TRUE_HEX)
    expect(
      Serializer.encode({ object: BOOL_FALSE_BYTE, type: BOOL_TYPE_NAME })
        .hexString
    ).toBe(BOOL_FALSE_HEX)
    expect(createEncodedBoolAction(BOOL_TRUE_BYTE).data.array[0]).toBe(
      BOOL_TRUE_BYTE
    )
  })

  test("encodes every element of a bool array", () => {
    expect(
      Serializer.encode({
        object: [true, false, BOOL_TRUE_BYTE],
        type: BOOL_ARRAY_TYPE_NAME
      }).hexString
    ).toBe(`03${BOOL_TRUE_HEX}${BOOL_FALSE_HEX}${BOOL_TRUE_HEX}`)
  })

  test("encodes negative zero as 00", () => {
    expect(
      Serializer.encode({ object: -0, type: BOOL_TYPE_NAME }).hexString
    ).toBe(BOOL_FALSE_HEX)
  })

  test.each(NON_BOOL_VALUES)("rejects %s", (_, value) => {
    expect(() =>
      Serializer.encode({ object: value, type: BOOL_TYPE_NAME })
    ).toThrow(INVALID_BOOL_VALUE_MESSAGE)
  })

  test("rejects a non-bool array element", () => {
    expect(() =>
      Serializer.encode({ object: [true, "true"], type: BOOL_ARRAY_TYPE_NAME })
    ).toThrow(INVALID_BOOL_VALUE_MESSAGE)
  })

  test("names the action field holding a non-bool value", () => {
    expect(() => createEncodedBoolAction("true")).toThrow(
      INVALID_FLAG_FIELD_MESSAGE
    )
  })
})

describe("bool values from objects", () => {
  test.each(BOOL_READINGS)("reads %p as %p", (value, expected) => {
    expect(Serializer.decode({ object: value, type: BOOL_TYPE_NAME })).toBe(
      expected
    )
  })

  test.each(NON_BOOL_VALUES)("rejects %s", (_, value) => {
    expect(() =>
      Serializer.decode({ object: value, type: BOOL_TYPE_NAME })
    ).toThrow(INVALID_BOOL_VALUE_MESSAGE)
  })

  test("reads the 0 and 1 nodeop gives bool fields in JSON as booleans", () => {
    const decodeRow = (flag: unknown) =>
      Serializer.decode({
        object: { [FLAG_FIELD_NAME]: flag, [MEMO_FIELD_NAME]: MEMO_VALUE },
        type: ACTION_TYPE,
        abi: ACTION_PREVIEW_ABI
      }) as Record<string, unknown>

    expect(decodeRow(BOOL_TRUE_BYTE)[FLAG_FIELD_NAME]).toBe(true)
    expect(decodeRow(BOOL_FALSE_BYTE)[FLAG_FIELD_NAME]).toBe(false)
  })

  test("names the struct field holding a non-bool value", () => {
    expect(() =>
      Serializer.decode({
        object: { [FLAG_FIELD_NAME]: "true", [MEMO_FIELD_NAME]: MEMO_VALUE },
        type: ACTION_TYPE,
        abi: ACTION_PREVIEW_ABI
      })
    ).toThrow(INVALID_FLAG_FIELD_MESSAGE)
  })
})
