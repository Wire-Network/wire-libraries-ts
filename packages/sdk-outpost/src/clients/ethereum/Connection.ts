import type { Provider, Signer } from "ethers"

/** Narrow an ethers v6 connection to a signer without relying on a v5 static guard. */
export function isEthereumSigner(
  connection: Provider | Signer
): connection is Signer {
  return (
    "sendTransaction" in connection &&
    typeof connection.sendTransaction === "function"
  )
}

/** Return the provider owned directly or through a connected signer. */
export function ethereumProvider(connection: Provider | Signer): Provider {
  if (!isEthereumSigner(connection)) return connection
  if (connection.provider == null) {
    throw new Error("Ethereum signer must be connected to a provider")
  }
  return connection.provider
}

/** Require a signer before an Ethereum operation can open a wallet prompt. */
export function assertEthereumSigner(
  connection: Provider | Signer,
  operation: string
): Signer {
  if (!isEthereumSigner(connection)) {
    throw new Error(`${operation} requires a connected signer.`)
  }
  return connection
}
