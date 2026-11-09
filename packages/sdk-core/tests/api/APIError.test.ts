import { APIError, type APIErrorData } from "@wireio/sdk-core"

const ErrorData: APIErrorData = {
  code: 0,
  name: "exception",
  what: "unspecified",
  details: []
}

describe("RPC error formatting", () => {
  it("preserves the RPC failure when details are empty or absent", () => {
    expect(APIError.formatError(ErrorData)).toBe("unspecified")
    expect(APIError.formatError({ ...ErrorData, details: undefined! })).toBe(
      "unspecified"
    )
    expect(APIError.formatError({ ...ErrorData, what: "quota exceeded" })).toBe(
      "quota exceeded"
    )
    expect(APIError.formatError({ ...ErrorData, what: "" })).toBe(
      "Unknown API error"
    )
  })

  it("retains detailed errors and the existing missing-account explanation", () => {
    const detail = {
      file: "http_plugin.cpp",
      line_number: 1,
      method: "call",
      message: "unknown key"
    }
    expect(APIError.formatError({ ...ErrorData, details: [detail] })).toBe(
      "Account not found"
    )
    expect(
      APIError.formatError({
        ...ErrorData,
        details: [{ ...detail, message: "invalid data" }]
      })
    ).toBe("invalid data")
  })
})
