/** Build-time origin of the executable interfaces compiled into sdk-outpost. */
export enum OutpostArtifactMode {
  /** Publishable SDK generated from canonical producer artifact packages. */
  sourcePackage = "sourcePackage",
  /** Local-only SDK generated from one exact deployment artifact bundle. */
  deploymentBundle = "deploymentBundle"
}
