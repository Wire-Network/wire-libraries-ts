import { createRoot } from "react-dom/client"
import { Provider } from "react-redux"
import { store } from "./Store"
import { App } from "./App"
import "./styles.css"

export function renderApp(): void {
  const root = createRoot(document.getElementById("app")!)
  root.render(
    <Provider store={store}>
      <App />
    </Provider>
  )
}
