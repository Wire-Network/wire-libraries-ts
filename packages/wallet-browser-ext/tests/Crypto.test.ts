import { encrypt, decrypt } from "@wireio/wallet-browser-ext/Crypto"

describe("Crypto", () => {
  const password = "test-password-123"
  const data = "hello world, this is secret data"

  it("encrypt returns a base64 string", async () => {
    const encrypted = await encrypt(data, password)
    expect(typeof encrypted).toBe("string")
    // Verify it is valid base64 by decoding without error
    expect(() => atob(encrypted)).not.toThrow()
  })

  it("decrypt with correct password returns original data", async () => {
    const encrypted = await encrypt(data, password)
    const decrypted = await decrypt(encrypted, password)
    expect(decrypted).toBe(data)
  })

  it("decrypt with wrong password throws", async () => {
    const encrypted = await encrypt(data, password)
    await expect(decrypt(encrypted, "wrong-password")).rejects.toThrow()
  })

  it("roundtrip preserves data for JSON content", async () => {
    const jsonData = JSON.stringify({ keys: ["a", "b"], count: 42 })
    const encrypted = await encrypt(jsonData, password)
    const decrypted = await decrypt(encrypted, password)
    expect(JSON.parse(decrypted)).toEqual({ keys: ["a", "b"], count: 42 })
  })

  it("different passwords produce different ciphertexts", async () => {
    const enc1 = await encrypt(data, "password-one")
    const enc2 = await encrypt(data, "password-two")
    expect(enc1).not.toBe(enc2)
  })

  it("encrypting same data twice produces different ciphertexts (random IV/salt)", async () => {
    const enc1 = await encrypt(data, password)
    const enc2 = await encrypt(data, password)
    expect(enc1).not.toBe(enc2)
  })

  it("handles empty string data", async () => {
    const encrypted = await encrypt("", password)
    const decrypted = await decrypt(encrypted, password)
    expect(decrypted).toBe("")
  })

  it("handles unicode data", async () => {
    const unicodeData = "Hello, \u4e16\u754c! \ud83c\udf0d"
    const encrypted = await encrypt(unicodeData, password)
    const decrypted = await decrypt(encrypted, password)
    expect(decrypted).toBe(unicodeData)
  })
})
