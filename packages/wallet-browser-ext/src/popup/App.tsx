import { useEffect } from "react"
import { useAppDispatch, useAppSelector } from "./Hooks"
import { initializeWallet } from "./slices/WalletSlice"
import { Header } from "./components/Header"
import { Toast } from "./components/Toast"
import { UnlockView } from "./views/UnlockView"
import { DashboardView } from "./views/DashboardView"
import { KeysView } from "./views/KeysView"
import { EndpointsView } from "./views/EndpointsView"
import { AccountsView } from "./views/AccountsView"
import { AccountEditView } from "./views/AccountEditView"

export function App() {
  const dispatch = useAppDispatch()
  const { locked, hasVault, currentView } = useAppSelector(
    (state) => state.wallet
  )

  useEffect(() => {
    dispatch(initializeWallet())
  }, [dispatch])

  const showUnlock = locked || !hasVault

  function renderView() {
    switch (currentView) {
      case "dashboard":
        return <DashboardView />
      case "keys":
        return <KeysView />
      case "endpoints":
        return <EndpointsView />
      case "accounts":
        return <AccountsView />
      case "account-edit":
        return <AccountEditView />
      default:
        return <UnlockView />
    }
  }

  return (
    <div className="app-container">
      {showUnlock ? (
        <UnlockView />
      ) : (
        <>
          <Header />
          <div className="app-content">{renderView()}</div>
        </>
      )}
      <Toast />
    </div>
  )
}
