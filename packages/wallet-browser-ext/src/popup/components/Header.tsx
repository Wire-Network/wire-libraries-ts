import { useAppDispatch } from "../Hooks"
import { lockWallet, navigate } from "../slices/WalletSlice"

export function Header() {
  const dispatch = useAppDispatch()

  return (
    <header className="header">
      <div className="header-left">
        <div className="header-logo">
          <svg
            width="28"
            height="14"
            viewBox="0 0 441 216"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M340.1 216C340.044 216 339.993 216 339.937 216C328.851 215.939 318.969 209.704 314.144 199.723L281.852 132.923L247.417 200.059C242.378 209.886 232.067 215.991 220.509 215.991C208.952 215.991 198.64 209.886 193.601 200.059L159.167 132.923L126.875 199.723C122.05 209.704 112.168 215.939 101.082 216C101.026 216 100.974 216 100.918 216C89.8977 216 80.02 209.886 75.1115 200.008L4.19964 57.4116C-1.98264 44.9778 -1.30609 30.5154 6.01 18.7159C13.2748 6.99573 25.8213 0 39.5716 0H85.3064C104.978 0 122.792 10.9087 131.797 28.4726L158.537 80.6047L187.685 20.3156C193.769 7.73261 206.036 0.214536 220.5 0.214536C234.964 0.214536 247.231 7.72794 253.315 20.3156L282.463 80.6047L309.203 28.4726C318.208 10.9087 336.022 0 355.694 0H401.428C415.179 0 427.725 6.99573 434.99 18.7159C442.306 30.5154 442.983 44.9778 436.8 57.4116L365.902 200.008C360.994 209.881 351.116 215.995 340.096 216H340.1ZM295.182 106.918L335.145 189.575C336.489 192.359 339.032 192.672 340.063 192.676C341.089 192.676 343.637 192.396 345.013 189.626L415.911 47.0299C418.51 41.8018 418.24 35.958 415.165 30.9957C412.141 26.1174 407.135 23.3191 401.433 23.3191H355.698C344.822 23.3191 334.963 29.3681 329.966 39.1108L295.187 106.918H295.182ZM39.5716 23.3191C33.8699 23.3191 28.8634 26.1174 25.8399 30.9957C22.7651 35.958 22.4898 41.8018 25.0934 47.0299L95.9866 189.626C97.3631 192.396 99.9246 192.672 100.937 192.676C101.968 192.672 104.511 192.354 105.855 189.575L145.818 106.918L111.039 39.1108C106.042 29.3727 96.1826 23.3191 85.3064 23.3191H39.5716ZM171.877 106.61L214.35 189.421C215.895 192.438 219.45 192.672 220.5 192.672C221.848 192.672 225.147 192.354 226.65 189.421L269.123 106.61L232.309 30.464C229.286 24.2099 223.043 23.5383 220.5 23.5383C217.957 23.5383 211.714 24.2145 208.691 30.464L171.877 106.61Z"
              fill="url(#header_grad)"
            />
            <defs>
              <linearGradient
                id="header_grad"
                x1="0"
                y1="108"
                x2="441"
                y2="108"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#8D4BF6" />
                <stop offset="0.27" stopColor="#6C5FF9" />
                <stop offset="0.56" stopColor="#5071FC" />
                <stop offset="0.81" stopColor="#3F7CFE" />
                <stop offset="1" stopColor="#3980FF" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <span className="header-title">Wire Wallet</span>
      </div>
      <div className="header-nav">
        <button
          className="header-nav-btn"
          onClick={() => dispatch(navigate("keys"))}
        >
          Keys
        </button>
        <button
          className="header-nav-btn"
          onClick={() => dispatch(navigate("endpoints"))}
        >
          Endpoints
        </button>
        <button
          className="header-nav-btn"
          onClick={() => dispatch(navigate("accounts"))}
        >
          Accounts
        </button>
      </div>
      <button
        className="header-lock-btn"
        onClick={() => dispatch(lockWallet())}
        title="Lock Wallet"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </button>
    </header>
  )
}
