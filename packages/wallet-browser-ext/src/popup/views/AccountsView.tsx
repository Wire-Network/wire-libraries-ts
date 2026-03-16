import { useState } from "react"
import { useAppDispatch, useAppSelector } from "../Hooks"
import {
  removeAccount,
  setActiveAccount,
  setEditingAccount,
  navigate,
  persistState,
  showToast,
} from "../slices/WalletSlice"
import { Modal } from "../components/Modal"

export function AccountsView() {
  const dispatch = useAppDispatch()
  const { accounts, activeAccount, keys, endpoints } = useAppSelector(
    (state) => state.wallet
  )

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  function handleSetActive(accountId: string) {
    const account = accounts.find((a) => a.id === accountId)
    if (!account) return

    dispatch(
      setActiveAccount({
        accountId: account.id,
        keyId: account.keys[0] ?? "",
        endpointId: account.endpoints[0] ?? "",
      })
    )
    dispatch(persistState())
    dispatch(showToast({ message: "Active account set", type: "success" }))
  }

  function handleEdit(accountId: string) {
    dispatch(setEditingAccount(accountId))
    dispatch(navigate("account-edit"))
  }

  function handleAddNew() {
    dispatch(setEditingAccount(null))
    dispatch(navigate("account-edit"))
  }

  function handleDelete(id: string) {
    dispatch(removeAccount(id))
    dispatch(persistState())
    dispatch(showToast({ message: "Account deleted", type: "success" }))
    setDeleteConfirmId(null)
  }

  return (
    <div className="view-container">
      <div className="view-header">
        <button
          className="btn btn-back"
          onClick={() => dispatch(navigate("dashboard"))}
        >
          &larr; Back
        </button>
        <h2 className="view-title">Accounts</h2>
        <button className="btn btn-sm btn-primary" onClick={handleAddNew}>
          + Add Account
        </button>
      </div>

      <div className="list-container">
        {accounts.length === 0 && (
          <p className="text-secondary text-center">No accounts yet</p>
        )}
        {accounts.map((acct) => {
          const isActive = activeAccount?.accountId === acct.id
          const keyCount = acct.keys.filter((kid) =>
            keys.some((k) => k.id === kid)
          ).length
          const endpointCount = acct.endpoints.filter((eid) =>
            endpoints.some((e) => e.id === eid)
          ).length

          return (
            <div
              key={acct.id}
              className={`list-item ${isActive ? "list-item-active" : ""}`}
            >
              <div className="list-item-header">
                <div className="list-item-info">
                  <span className="list-item-name">{acct.name}</span>
                  {isActive && <span className="badge badge-active">Active</span>}
                </div>
                <span className="list-item-sub">
                  {keyCount} key{keyCount !== 1 ? "s" : ""},{" "}
                  {endpointCount} endpoint{endpointCount !== 1 ? "s" : ""}
                </span>
                <div className="detail-actions">
                  {!isActive && (
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => handleSetActive(acct.id)}
                    >
                      Set Active
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => handleEdit(acct.id)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => setDeleteConfirmId(acct.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <Modal
          title="Delete Account"
          onClose={() => setDeleteConfirmId(null)}
        >
          <p>
            Are you sure you want to delete this account? This action cannot be
            undone.
          </p>
          <div className="modal-actions">
            <button
              className="btn btn-danger"
              onClick={() => handleDelete(deleteConfirmId)}
            >
              Delete
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setDeleteConfirmId(null)}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
