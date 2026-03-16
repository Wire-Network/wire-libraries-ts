import { createSlice, createAsyncThunk, type PayloadAction } from "@reduxjs/toolkit"
import type {
  KeyPair,
  ChainEndpoint,
  WireAccount,
  ExtensionState,
  BackgroundResponse,
} from "../../Types"

export type ViewName =
  | "unlock"
  | "dashboard"
  | "keys"
  | "endpoints"
  | "accounts"
  | "account-edit"

export interface WalletState {
  locked: boolean
  hasVault: boolean
  keys: KeyPair[]
  endpoints: ChainEndpoint[]
  accounts: WireAccount[]
  activeAccount: {
    accountId: string
    keyId: string
    endpointId: string
  } | null
  currentView: ViewName
  editingAccountId: string | null
  toastMessage: string | null
  toastType: "success" | "error" | "info"
}

const initialState: WalletState = {
  locked: true,
  hasVault: false,
  keys: [],
  endpoints: [],
  accounts: [],
  activeAccount: null,
  currentView: "unlock",
  editingAccountId: null,
  toastMessage: null,
  toastType: "info",
}

function sendBackground(message: any): Promise<BackgroundResponse> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response: BackgroundResponse) => {
      resolve(response)
    })
  })
}

export const initializeWallet = createAsyncThunk(
  "wallet/initialize",
  async (_, { dispatch }) => {
    const vaultResult = await sendBackground({ type: "HAS_VAULT" })
    const hasVault = vaultResult.success && vaultResult.data === true

    if (hasVault) {
      const unlockedResult = await sendBackground({ type: "IS_UNLOCKED" })
      if (unlockedResult.success && unlockedResult.data === true) {
        const stateResult = await sendBackground({ type: "GET_STATE" })
        if (stateResult.success && stateResult.data) {
          dispatch(walletSlice.actions.loadState(stateResult.data))
          dispatch(walletSlice.actions.setLocked(false))
          const state = stateResult.data as ExtensionState
          if (state.accounts.length === 0) {
            dispatch(walletSlice.actions.navigate("account-edit"))
          } else {
            dispatch(walletSlice.actions.navigate("dashboard"))
          }
        }
      }
    }

    return hasVault
  }
)

export const unlockWallet = createAsyncThunk(
  "wallet/unlock",
  async (password: string, { dispatch }) => {
    const result = await sendBackground({ type: "UNLOCK", password })
    if (!result.success) {
      throw new Error((result as { success: false; error: string }).error)
    }
    dispatch(walletSlice.actions.loadState(result.data))
    dispatch(walletSlice.actions.setLocked(false))
    const state = result.data as ExtensionState
    if (state.accounts.length === 0) {
      dispatch(walletSlice.actions.navigate("account-edit"))
    } else {
      dispatch(walletSlice.actions.navigate("dashboard"))
    }
    return result.data
  }
)

export const setupWallet = createAsyncThunk(
  "wallet/setup",
  async (password: string, { dispatch }) => {
    const initialState: ExtensionState = {
      keys: [],
      endpoints: [],
      accounts: [],
    }
    const result = await sendBackground({
      type: "SETUP",
      password,
      initialState,
    })
    if (!result.success) {
      throw new Error((result as { success: false; error: string }).error)
    }
    dispatch(walletSlice.actions.loadState(initialState))
    dispatch(walletSlice.actions.setLocked(false))
    dispatch(walletSlice.actions.setHasVault(true))
    dispatch(walletSlice.actions.navigate("account-edit"))
  }
)

export const lockWallet = createAsyncThunk(
  "wallet/lock",
  async (_, { dispatch }) => {
    await sendBackground({ type: "LOCK" })
    dispatch(walletSlice.actions.setLocked(true))
    dispatch(walletSlice.actions.navigate("unlock"))
  }
)

export const persistState = createAsyncThunk(
  "wallet/persist",
  async (_, { getState }) => {
    const walletState = (getState() as { wallet: WalletState }).wallet
    const extensionState: ExtensionState = {
      keys: walletState.keys,
      endpoints: walletState.endpoints,
      accounts: walletState.accounts,
      activeAccount: walletState.activeAccount ?? undefined,
    }
    const result = await sendBackground({
      type: "SAVE_STATE",
      state: extensionState,
    })
    if (!result.success) {
      throw new Error((result as { success: false; error: string }).error)
    }
  }
)

const walletSlice = createSlice({
  name: "wallet",
  initialState,
  reducers: {
    setLocked(state, action: PayloadAction<boolean>) {
      state.locked = action.payload
    },
    setHasVault(state, action: PayloadAction<boolean>) {
      state.hasVault = action.payload
    },
    setKeys(state, action: PayloadAction<KeyPair[]>) {
      state.keys = action.payload
    },
    addKey(state, action: PayloadAction<KeyPair>) {
      state.keys.push(action.payload)
    },
    removeKey(state, action: PayloadAction<string>) {
      state.keys = state.keys.filter((k) => k.id !== action.payload)
      // Remove key from any accounts
      state.accounts = state.accounts.map((a) => ({
        ...a,
        keys: a.keys.filter((kid) => kid !== action.payload),
      }))
      // Clear activeAccount key if removed
      if (state.activeAccount?.keyId === action.payload) {
        state.activeAccount = null
      }
    },
    renameKey(
      state,
      action: PayloadAction<{ id: string; name: string }>
    ) {
      const key = state.keys.find((k) => k.id === action.payload.id)
      if (key) {
        key.name = action.payload.name
      }
    },
    setEndpoints(state, action: PayloadAction<ChainEndpoint[]>) {
      state.endpoints = action.payload
    },
    addEndpoint(state, action: PayloadAction<ChainEndpoint>) {
      state.endpoints.push(action.payload)
    },
    updateEndpoint(state, action: PayloadAction<ChainEndpoint>) {
      const idx = state.endpoints.findIndex(
        (e) => e.id === action.payload.id
      )
      if (idx !== -1) {
        state.endpoints[idx] = action.payload
      }
    },
    removeEndpoint(state, action: PayloadAction<string>) {
      state.endpoints = state.endpoints.filter(
        (e) => e.id !== action.payload
      )
      // Remove endpoint from any accounts
      state.accounts = state.accounts.map((a) => ({
        ...a,
        endpoints: a.endpoints.filter((eid) => eid !== action.payload),
      }))
      // Clear activeAccount endpoint if removed
      if (state.activeAccount?.endpointId === action.payload) {
        state.activeAccount = null
      }
    },
    setAccounts(state, action: PayloadAction<WireAccount[]>) {
      state.accounts = action.payload
    },
    addAccount(state, action: PayloadAction<WireAccount>) {
      state.accounts.push(action.payload)
    },
    updateAccount(state, action: PayloadAction<WireAccount>) {
      const idx = state.accounts.findIndex(
        (a) => a.id === action.payload.id
      )
      if (idx !== -1) {
        state.accounts[idx] = action.payload
      }
    },
    removeAccount(state, action: PayloadAction<string>) {
      state.accounts = state.accounts.filter(
        (a) => a.id !== action.payload
      )
      if (state.activeAccount?.accountId === action.payload) {
        state.activeAccount = null
      }
    },
    setActiveAccount(
      state,
      action: PayloadAction<{
        accountId: string
        keyId: string
        endpointId: string
      } | null>
    ) {
      state.activeAccount = action.payload
    },
    navigate(state, action: PayloadAction<ViewName>) {
      state.currentView = action.payload
    },
    setEditingAccount(state, action: PayloadAction<string | null>) {
      state.editingAccountId = action.payload
    },
    showToast(
      state,
      action: PayloadAction<{
        message: string
        type: "success" | "error" | "info"
      }>
    ) {
      state.toastMessage = action.payload.message
      state.toastType = action.payload.type
    },
    hideToast(state) {
      state.toastMessage = null
    },
    loadState(state, action: PayloadAction<ExtensionState>) {
      state.keys = action.payload.keys
      state.endpoints = action.payload.endpoints
      state.accounts = action.payload.accounts
      state.activeAccount = action.payload.activeAccount ?? null
    },
  },
  extraReducers: (builder) => {
    builder.addCase(initializeWallet.fulfilled, (state, action) => {
      state.hasVault = action.payload
    })
  },
})

export const {
  setLocked,
  setHasVault,
  setKeys,
  addKey,
  removeKey,
  renameKey,
  setEndpoints,
  addEndpoint,
  updateEndpoint,
  removeEndpoint,
  setAccounts,
  addAccount,
  updateAccount,
  removeAccount,
  setActiveAccount,
  navigate,
  setEditingAccount,
  showToast,
  hideToast,
  loadState,
} = walletSlice.actions

export default walletSlice.reducer
