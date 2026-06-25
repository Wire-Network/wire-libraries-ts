describe("Injected provider", () => {
  beforeEach(() => {
    jest.resetModules()
    delete (window as any).__WIRE_WALLET__
  })

  it("rejects web-page signing until an approval flow exists", async () => {
    require("../src/inject/Provider")

    await expect(
      (window as any).__WIRE_WALLET__.signTransaction("00" as any, "acct-1")
    ).rejects.toThrow("requires user approval")
  })
})
