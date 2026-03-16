import { TextEncoder, TextDecoder } from "util"
import { webcrypto } from "crypto"

if (typeof globalThis.TextEncoder === "undefined") {
  ;(globalThis as any).TextEncoder = TextEncoder
}
if (typeof globalThis.TextDecoder === "undefined") {
  ;(globalThis as any).TextDecoder = TextDecoder
}

// jsdom provides a crypto object without subtle — override with Node's webcrypto
Object.defineProperty(globalThis, "crypto", {
  value: webcrypto,
  writable: true,
  configurable: true,
})
