import { useState, useEffect } from "react"
import { useAppDispatch, useAppSelector } from "../Hooks"
import {
  addAccount,
  updateAccount,
  setActiveAccount,
  setEditingAccount,
  navigate,
  persistState,
  showToast,
} from "../slices/WalletSlice"
import { isValidAccountName } from "../../Validation"

function generateId(): string {
  return crypto.randomUUID()
}

export function AccountEditView() {
  const dispatch = useAppDispatch()
  const { keys, endpoints, accounts, editingAccountId } = useAppSelector(
    (state) => state.wallet
  )

  const existingAccount = editingAccountId
    ? accounts.find((a) => a.id === editingAccountId)
    : null

  const [name, setName] = useState("")
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [selectedEndpoints, setSelectedEndpoints] = useState<Set<string>>(
    new Set()
  )
  const [nameError, setNameError] = useState("")

  useEffect(() => {
    if (existingAccount) {
      setName(existingAccount.name)
      setSelectedKeys(new Set(existingAccount.keys))
      setSelectedEndpoints(new Set(existingAccount.endpoints))
    } else {
      setName("")
      setSelectedKeys(new Set())
      setSelectedEndpoints(new Set())
    }
  }, [existingAccount])

  function toggleKey(id: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function toggleEndpoint(id: string) {
    setSelectedEndpoints((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function handleSave() {
    setNameError("")

    if (!isValidAccountName(name)) {
      setNameError("Account name must be 1-12 chars: a-z, 1-5, or .")
      return
    }

    // Check name uniqueness (except when editing the same account)
    const duplicate = accounts.find(
      (a) => a.name === name && a.id !== editingAccountId
    )
    if (duplicate) {
      setNameError("An account with this name already exists")
      return
    }

    if (selectedKeys.size === 0) {
      dispatch(
        showToast({
          message: "Select at least one key",
          type: "error",
        })
      )
      return
    }

    if (selectedEndpoints.size === 0) {
      dispatch(
        showToast({
          message: "Select at least one endpoint",
          type: "error",
        })
      )
      return
    }

    const keyIds = Array.from(selectedKeys)
    const endpointIds = Array.from(selectedEndpoints)

    if (existingAccount) {
      dispatch(
        updateAccount({
          id: existingAccount.id,
          name,
          keys: keyIds,
          endpoints: endpointIds,
        })
      )
      dispatch(
        showToast({ message: "Account updated", type: "success" })
      )
    } else {
      const newId = generateId()
      dispatch(
        addAccount({
          id: newId,
          name,
          keys: keyIds,
          endpoints: endpointIds,
        })
      )
      // Set as active if it's the first account
      if (accounts.length === 0) {
        dispatch(
          setActiveAccount({
            accountId: newId,
            keyId: keyIds[0],
            endpointId: endpointIds[0],
          })
        )
      }
      dispatch(
        showToast({ message: "Account created", type: "success" })
      )
    }

    dispatch(persistState())
    dispatch(setEditingAccount(null))
    dispatch(navigate("dashboard"))
  }

  function handleCancel() {
    dispatch(setEditingAccount(null))
    if (accounts.length > 0) {
      dispatch(navigate("accounts"))
    } else {
      dispatch(navigate("dashboard"))
    }
  }

  return (
    <div className="view-container">
      <div className="view-header">
        <button className="btn btn-back" onClick={handleCancel}>
          &larr; Back
        </button>
        <h2 className="view-title">
          {existingAccount ? "Edit Account" : "New Account"}
        </h2>
      </div>

      <div className="form-section">
        <div className="form-group">
          <label className="form-label">Account Name</label>
          <input
            className={`form-input ${nameError ? "form-input-error" : ""}`}
            placeholder="e.g. myaccount"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setNameError("")
            }}
            maxLength={12}
          />
          {nameError && <p className="form-error">{nameError}</p>}
          <p className="form-hint">
            Lowercase a-z, digits 1-5, and period. Max 12 characters.
          </p>
        </div>
      </div>

      {/* Keys Section */}
      <div className="form-section">
        <h3 className="form-section-title">Keys</h3>
        {keys.length === 0 ? (
          <div className="empty-link">
            <p className="text-secondary">No keys available.</p>
            <button
              className="btn btn-link"
              onClick={() => dispatch(navigate("keys"))}
            >
              Add a key first
            </button>
          </div>
        ) : (
          <div className="checkbox-list">
            {keys.map((k) => (
              <label key={k.id} className="checkbox-item">
                <input
                  type="checkbox"
                  checked={selectedKeys.has(k.id)}
                  onChange={() => toggleKey(k.id)}
                />
                <span className="checkbox-label">
                  <span className="checkbox-name">{k.name}</span>
                  <span className="badge badge-key badge-sm">{k.type}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Endpoints Section */}
      <div className="form-section">
        <h3 className="form-section-title">Endpoints</h3>
        {endpoints.length === 0 ? (
          <div className="empty-link">
            <p className="text-secondary">No endpoints available.</p>
            <button
              className="btn btn-link"
              onClick={() => dispatch(navigate("endpoints"))}
            >
              Add an endpoint first
            </button>
          </div>
        ) : (
          <div className="checkbox-list">
            {endpoints.map((ep) => (
              <label key={ep.id} className="checkbox-item">
                <input
                  type="checkbox"
                  checked={selectedEndpoints.has(ep.id)}
                  onChange={() => toggleEndpoint(ep.id)}
                />
                <span className="checkbox-label">
                  <span className="checkbox-name">{ep.name}</span>
                  <span className="badge badge-endpoint badge-sm">
                    {ep.kind}
                  </span>
                  <span className="checkbox-url">{ep.url}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="form-actions">
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={!name.trim()}
        >
          {existingAccount ? "Save Changes" : "Create Account"}
        </button>
        <button className="btn btn-secondary" onClick={handleCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
