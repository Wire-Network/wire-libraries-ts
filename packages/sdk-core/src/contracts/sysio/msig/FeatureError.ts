import type { MsigCapabilities } from "./Types.js"

/** Error thrown when a requested `sysio.msig` feature is absent from the deployed contract ABI. */
export class FeatureError extends Error {
  /** Feature requested by the caller. */
  readonly feature: string

  /** ABI-derived capability matrix for the deployed contract. */
  readonly capabilities: MsigCapabilities

  /**
   * Creates an unsupported feature error.
   *
   * @param feature Feature requested by the caller.
   * @param capabilities ABI-derived capability matrix.
   * @param message Optional custom error message.
   */
  constructor(
    feature: string,
    capabilities: MsigCapabilities,
    message?: string
  ) {
    super(message || `${capabilities.contract} does not support ${feature}.`)
    this.name = "FeatureError"
    this.feature = feature
    this.capabilities = capabilities
  }
}
