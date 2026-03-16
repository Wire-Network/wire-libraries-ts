import { useAppDispatch, useAppSelector } from "../Hooks"
import {
  setActiveAccount,
  persistState,
  navigate,
  showToast,
} from "../slices/WalletSlice"

export function DashboardView() {
  const dispatch = useAppDispatch()
  const { accounts, keys, endpoints, activeAccount } = useAppSelector(
    (state) => state.wallet
  )

  const currentAccount = activeAccount
    ? accounts.find((a) => a.id === activeAccount.accountId)
    : accounts[0]

  const currentKey = activeAccount
    ? keys.find((k) => k.id === activeAccount.keyId)
    : null

  const currentEndpoint = activeAccount
    ? endpoints.find((e) => e.id === activeAccount.endpointId)
    : null

  // Get keys and endpoints available to the current account
  const accountKeys = currentAccount
    ? keys.filter((k) => currentAccount.keys.includes(k.id))
    : []
  const accountEndpoints = currentAccount
    ? endpoints.filter((e) => currentAccount.endpoints.includes(e.id))
    : []

  function handleKeyChange(keyId: string) {
    if (!currentAccount || !activeAccount) return
    dispatch(
      setActiveAccount({
        accountId: activeAccount.accountId,
        keyId,
        endpointId: activeAccount.endpointId,
      })
    )
    dispatch(persistState())
    dispatch(showToast({ message: "Active key updated", type: "info" }))
  }

  function handleEndpointChange(endpointId: string) {
    if (!currentAccount || !activeAccount) return
    dispatch(
      setActiveAccount({
        accountId: activeAccount.accountId,
        keyId: activeAccount.keyId,
        endpointId,
      })
    )
    dispatch(persistState())
    dispatch(showToast({ message: "Active endpoint updated", type: "info" }))
  }

  if (!currentAccount) {
    return (
      <div className="view-container">
        <div className="empty-state">
          <p>No accounts found</p>
          <button
            className="btn btn-primary"
            onClick={() => dispatch(navigate("account-edit"))}
          >
            Create Account
          </button>
        </div>
      </div>
    )
  }

  function truncateKey(key: string): string {
    if (key.length <= 20) return key
    return key.substring(0, 12) + "..." + key.substring(key.length - 8)
  }

  return (
    <div className="view-container">
      <div className="dashboard-account">
        <h2 className="dashboard-account-name">{currentAccount.name}</h2>
        {accounts.length > 1 && (
          <select
            className="form-select"
            value={currentAccount.id}
            onChange={(e) => {
              const acct = accounts.find((a) => a.id === e.target.value)
              if (acct) {
                dispatch(
                  setActiveAccount({
                    accountId: acct.id,
                    keyId: acct.keys[0] ?? "",
                    endpointId: acct.endpoints[0] ?? "",
                  })
                )
                dispatch(persistState())
              }
            }}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="dashboard-section">
        <label className="form-label">Active Key</label>
        {accountKeys.length > 0 ? (
          <>
            <select
              className="form-select"
              value={currentKey?.id ?? accountKeys[0]?.id ?? ""}
              onChange={(e) => handleKeyChange(e.target.value)}
            >
              {accountKeys.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name} ({k.type})
                </option>
              ))}
            </select>
            {(currentKey ?? accountKeys[0]) && (
              <div className="dashboard-detail">
                <span className="badge badge-key">
                  {(currentKey ?? accountKeys[0]).type}
                </span>
                <span className="detail-text">
                  {truncateKey((currentKey ?? accountKeys[0]).publicKey)}
                </span>
              </div>
            )}
          </>
        ) : (
          <p className="text-secondary">No keys assigned</p>
        )}
      </div>

      <div className="dashboard-section">
        <label className="form-label">Active Endpoint</label>
        {accountEndpoints.length > 0 ? (
          <>
            <select
              className="form-select"
              value={
                currentEndpoint?.id ?? accountEndpoints[0]?.id ?? ""
              }
              onChange={(e) => handleEndpointChange(e.target.value)}
            >
              {accountEndpoints.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {ep.name} ({ep.kind})
                </option>
              ))}
            </select>
            {(currentEndpoint ?? accountEndpoints[0]) && (
              <div className="dashboard-detail">
                <span className="badge badge-endpoint">
                  {(currentEndpoint ?? accountEndpoints[0]).kind}
                </span>
                <span className="detail-text">
                  {(currentEndpoint ?? accountEndpoints[0]).url}
                </span>
              </div>
            )}
          </>
        ) : (
          <p className="text-secondary">No endpoints assigned</p>
        )}
      </div>

      <div className="dashboard-actions">
        <button
          className="btn btn-secondary"
          onClick={() => dispatch(navigate("keys"))}
        >
          Manage Keys
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => dispatch(navigate("endpoints"))}
        >
          Manage Endpoints
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => dispatch(navigate("accounts"))}
        >
          All Accounts
        </button>
      </div>
    </div>
  )
}
