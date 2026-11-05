import * as AnchorNamespace from "@coral-xyz/anchor"

/** Native ESM wraps Anchor's CommonJS exports, while transpiled CJS retains them. */
interface AnchorDefaultExport {
  readonly default?: typeof AnchorNamespace
}

const anchor = AnchorNamespace as typeof AnchorNamespace & AnchorDefaultExport

/** The producer's BN constructor, shared by native ESM and transpiled consumers. */
export const BN = (anchor.default ?? anchor).BN
