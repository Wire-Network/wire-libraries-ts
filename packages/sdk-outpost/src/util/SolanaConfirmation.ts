import type { Connection } from "@solana/web3.js"

/** Source-chain commitment used by outpost custody submissions. */
export const SolanaConfirmationCommitment = "confirmed"

const SolanaConfirmationStatus = {
  confirmed: "confirmed",
  finalized: "finalized"
} as const

/** Read one signature over HTTP; propagate RPC failures and reject terminal chain errors. */
export async function isSolanaTransactionConfirmed(
  connection: Connection,
  transactionId: string,
  lastValidBlockHeight: number
): Promise<boolean> {
  const [response, blockHeight] = await Promise.all([
      connection.getSignatureStatuses([transactionId], {
        searchTransactionHistory: true
      }),
      connection.getBlockHeight(SolanaConfirmationCommitment)
    ]),
    status = response.value[0]

  if (status?.err != null)
    throw new Error(
      `Solana transaction ${transactionId} failed: ${JSON.stringify(status.err)}`
    )
  if (status == null && blockHeight > lastValidBlockHeight)
    throw new Error(
      `Solana signature ${transactionId} was not recorded before its blockhash expired. Check the signature and depot before resubmitting.`
    )
  return (
    status?.confirmationStatus === SolanaConfirmationStatus.confirmed ||
    status?.confirmationStatus === SolanaConfirmationStatus.finalized
  )
}
