import * as anchor from "@coral-xyz/anchor"

/** Native ESM wraps Anchor's CommonJS exports under default; CJS does not. */
interface AnchorModuleExports {
  default?: typeof anchor
}

const AnchorModule = anchor as typeof anchor & AnchorModuleExports

/** Anchor's own BN constructor; its CJS getter is not a Node 22 named export. */
export const BN = (AnchorModule.default ?? anchor).BN
