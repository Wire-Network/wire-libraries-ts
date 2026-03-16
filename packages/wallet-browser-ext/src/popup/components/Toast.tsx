import { useEffect } from "react"
import { useAppDispatch, useAppSelector } from "../Hooks"
import { hideToast } from "../slices/WalletSlice"

export function Toast() {
  const dispatch = useAppDispatch()
  const { toastMessage, toastType } = useAppSelector((state) => state.wallet)

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        dispatch(hideToast())
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [toastMessage, dispatch])

  if (!toastMessage) return null

  return (
    <div className={`toast toast-${toastType}`}>
      <span>{toastMessage}</span>
      <button className="toast-close" onClick={() => dispatch(hideToast())}>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}
