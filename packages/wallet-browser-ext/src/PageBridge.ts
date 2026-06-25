/** Message types that are safe for arbitrary web pages to request through the content script bridge. */
export const PageBackgroundMessageType = {
  GET_ACCOUNTS: "GET_ACCOUNTS",
  IS_UNLOCKED: "IS_UNLOCKED"
} as const

/** Background message type exposed to the injected page provider. */
export type PageBackgroundMessageType =
  (typeof PageBackgroundMessageType)[keyof typeof PageBackgroundMessageType]

/** Canonical allowlist for webpage-originated provider traffic. */
export const PAGE_BACKGROUND_MESSAGE_TYPES = new Set<PageBackgroundMessageType>(
  Object.values(PageBackgroundMessageType)
)

/** Error returned when a webpage asks for a privileged extension-only command. */
export const UNAUTHORIZED_PAGE_REQUEST_ERROR =
  "Unauthorized wallet request from page context"
