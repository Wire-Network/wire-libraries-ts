import { encrypt, decrypt } from "./Crypto"
import type { ExtensionState } from "./Types"

const VAULT_KEY = "wire_wallet_vault"

export async function saveEncryptedState(
  state: ExtensionState,
  password: string
): Promise<void> {
  const json = JSON.stringify(state)
  const encrypted = await encrypt(json, password)
  await chrome.storage.local.set({ [VAULT_KEY]: encrypted })
}

export async function loadEncryptedState(
  password: string
): Promise<ExtensionState> {
  const result = await chrome.storage.local.get(VAULT_KEY)
  const encrypted = result[VAULT_KEY]

  if (!encrypted) {
    throw new Error("No vault found")
  }

  const json = await decrypt(encrypted, password)
  return JSON.parse(json) as ExtensionState
}

export async function hasVault(): Promise<boolean> {
  const result = await chrome.storage.local.get(VAULT_KEY)
  return !!result[VAULT_KEY]
}

export async function clearVault(): Promise<void> {
  await chrome.storage.local.remove(VAULT_KEY)
}
