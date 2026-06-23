import type { APIClient } from "../../../api/Client.js"
import type { ABIDef } from "../../../chain/Abi.js"
import { Name, NameType } from "../../../chain/Name.js"
import { Transaction } from "../../../chain/Transaction.js"
import { Serializer } from "../../../serializer/index.js"

import type {
  BuildProposalTransactionOptions,
  CreateProposalTransactionOptions,
  DecodedProposalAction
} from "./Types.js"

function actionAbiFor(
  abis: ABIDef | { contract: NameType; abi: ABIDef }[] | null,
  account: NameType
): ABIDef | null {
  if (!abis) {
    return null
  }

  if (!Array.isArray(abis)) {
    return abis
  }

  return abis.find(candidate => Name.from(candidate.contract).equals(account))?.abi ?? null
}

function objectify(value: unknown): unknown {
  try {
    return Serializer.objectify(value as any)
  } catch {
    return value
  }
}

/** Builds an inner proposal transaction from a caller-provided header. */
export function buildProposalTransaction(
  options: BuildProposalTransactionOptions
): Transaction {
  return Transaction.from(
    {
      ...options.header,
      context_free_actions: [],
      actions: options.actions,
      transaction_extensions: []
    },
    options.abis
  )
}

/** Builds an inner proposal transaction from the current chain header. */
export async function createProposalTransaction(
  client: APIClient,
  options: CreateProposalTransactionOptions
): Promise<Transaction> {
  const info = await client.v1.chain.get_info()

  return buildProposalTransaction({
    header: info.getTransactionHeader(options.expirationSeconds ?? 3600),
    actions: options.actions,
    abis: options.abis
  })
}

/** Decodes every action in a proposal transaction with optional contract ABIs. */
export function decodeProposalTransactionActions(
  transaction: Transaction,
  abis: ABIDef | { contract: NameType; abi: ABIDef }[] | null = null
): DecodedProposalAction[] {
  return transaction.actions.map(action => {
    const account = action.account.toString(),
      name = action.name.toString(),
      authorization = action.authorization.map(String),
      rawData = action.data.hexString,
      abi = actionAbiFor(abis, action.account)

    if (!abi && !action.abi) {
      return {
        account,
        name,
        authorization,
        data: null,
        rawData,
        decoded: false,
        error: `Missing ABI for ${account}.`
      }
    }

    try {
      const data = abi ? action.decodeData(abi) : action.decoded.data

      return {
        account,
        name,
        authorization,
        data: objectify(data),
        rawData,
        decoded: true,
        error: null
      }
    } catch (error) {
      return {
        account,
        name,
        authorization,
        data: null,
        rawData,
        decoded: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })
}
