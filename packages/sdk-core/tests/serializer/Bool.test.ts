import { Action } from "@wireio/sdk-core/chain/Action"
import { ABIDef } from "@wireio/sdk-core/chain/Abi"

const BOOL_FALSE_BYTE = 0x00
const BOOL_TRUE_BYTE = 0x01
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
function createEncodedBoolAction(flag: boolean) {
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
