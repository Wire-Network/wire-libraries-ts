import { useState } from "react"
import { PrivateKey, KeyType } from "@wireio/sdk-core"
import { useAppDispatch, useAppSelector } from "../Hooks"
import {
  addKey,
  removeKey,
  renameKey,
  navigate,
  persistState,
  showToast,
} from "../slices/WalletSlice"
import { isValidKeyName } from "../../Validation"
import { Modal } from "../components/Modal"
import type { KeyPair } from "../../Types"

function generateId(): string {
  return crypto.randomUUID()
}

function deriveEthereumAddress(publicKeyHex: string): string {
  // Simplified: return a placeholder for the ethereum address
  // In production, you'd use keccak256 on the uncompressed public key
  return "0x" + publicKeyHex.substring(0, 40)
}

export function KeysView() {
  const dispatch = useAppDispatch()
  const { keys } = useAppSelector((state) => state.wallet)

  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [showPrivateKeys, setShowPrivateKeys] = useState<Set<string>>(
    new Set()
  )
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Generate form state
  const [genName, setGenName] = useState("")
  const [genType, setGenType] = useState<KeyType>(KeyType.K1)
  const [genLoading, setGenLoading] = useState(false)

  // Import form state
  const [importName, setImportName] = useState("")
  const [importPrivateKey, setImportPrivateKey] = useState("")
  const [importLoading, setImportLoading] = useState(false)

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")

  const existingNames = keys.map((k) => k.name)

  function handleGenerate() {
    if (!isValidKeyName(genName, existingNames)) {
      dispatch(
        showToast({
          message: "Invalid or duplicate key name",
          type: "error",
        })
      )
      return
    }

    setGenLoading(true)
    try {
      const privateKey = PrivateKey.generate(genType)
      const publicKey = privateKey.toPublic()

      const keyPair: KeyPair = {
        id: generateId(),
        name: genName.trim(),
        type: genType,
        privateKey: privateKey.toString(),
        publicKey: publicKey.toString(),
      }

      if (genType === KeyType.EM) {
        keyPair.address = deriveEthereumAddress(
          publicKey.toString().replace(/^PUB_EM_/, "")
        )
      }

      dispatch(addKey(keyPair))
      dispatch(persistState())
      dispatch(
        showToast({ message: "Key generated successfully", type: "success" })
      )
      setGenName("")
    } catch (err: any) {
      dispatch(
        showToast({
          message: `Generation failed: ${err?.message ?? String(err)}`,
          type: "error",
        })
      )
    } finally {
      setGenLoading(false)
    }
  }

  function handleImport() {
    if (!isValidKeyName(importName, existingNames)) {
      dispatch(
        showToast({
          message: "Invalid or duplicate key name",
          type: "error",
        })
      )
      return
    }

    setImportLoading(true)
    try {
      const privateKey = PrivateKey.from(importPrivateKey.trim())
      const publicKey = privateKey.toPublic()

      const keyPair: KeyPair = {
        id: generateId(),
        name: importName.trim(),
        type: privateKey.type,
        privateKey: privateKey.toString(),
        publicKey: publicKey.toString(),
      }

      if (privateKey.type === KeyType.EM) {
        keyPair.address = deriveEthereumAddress(
          publicKey.toString().replace(/^PUB_EM_/, "")
        )
      }

      dispatch(addKey(keyPair))
      dispatch(persistState())
      dispatch(
        showToast({ message: "Key imported successfully", type: "success" })
      )
      setImportName("")
      setImportPrivateKey("")
    } catch (err: any) {
      dispatch(
        showToast({
          message: `Import failed: ${err?.message ?? String(err)}`,
          type: "error",
        })
      )
    } finally {
      setImportLoading(false)
    }
  }

  function handleDelete(id: string) {
    dispatch(removeKey(id))
    dispatch(persistState())
    dispatch(showToast({ message: "Key deleted", type: "success" }))
    setDeleteConfirmId(null)
  }

  function handleRename(id: string) {
    if (!renameValue.trim()) return
    dispatch(renameKey({ id, name: renameValue.trim() }))
    dispatch(persistState())
    dispatch(showToast({ message: "Key renamed", type: "success" }))
    setRenamingId(null)
    setRenameValue("")
  }

  function toggleShowPrivateKey(id: string) {
    setShowPrivateKeys((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      dispatch(showToast({ message: "Copied to clipboard", type: "info" }))
    })
  }

  function truncateKey(key: string): string {
    if (key.length <= 24) return key
    return key.substring(0, 14) + "..." + key.substring(key.length - 8)
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
        <h2 className="view-title">Keys</h2>
      </div>

      {/* Key List */}
      <div className="list-container">
        {keys.length === 0 && (
          <p className="text-secondary text-center">No keys yet</p>
        )}
        {keys.map((k) => (
          <div key={k.id} className="list-item">
            <div
              className="list-item-header"
              onClick={() =>
                setExpandedKey(expandedKey === k.id ? null : k.id)
              }
            >
              <div className="list-item-info">
                {renamingId === k.id ? (
                  <div className="inline-edit">
                    <input
                      className="form-input form-input-sm"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(k.id)
                        if (e.key === "Escape") setRenamingId(null)
                      }}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                    />
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRename(k.id)
                      }}
                    >
                      Save
                    </button>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={(e) => {
                        e.stopPropagation()
                        setRenamingId(null)
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="list-item-name">{k.name}</span>
                    <span className="badge badge-key">{k.type}</span>
                  </>
                )}
              </div>
              <span className="list-item-sub">{truncateKey(k.publicKey)}</span>
              {k.address && (
                <span className="list-item-sub">ETH: {k.address}</span>
              )}
            </div>

            {expandedKey === k.id && (
              <div className="list-item-detail">
                <div className="detail-row">
                  <label className="form-label">Public Key</label>
                  <div className="detail-value-row">
                    <code className="detail-code">{k.publicKey}</code>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => copyToClipboard(k.publicKey)}
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div className="detail-row">
                  <label className="form-label">Private Key</label>
                  <div className="detail-value-row">
                    <code className="detail-code">
                      {showPrivateKeys.has(k.id)
                        ? k.privateKey
                        : "***************"}
                    </code>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => toggleShowPrivateKey(k.id)}
                    >
                      {showPrivateKeys.has(k.id) ? "Hide" : "Show"}
                    </button>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => copyToClipboard(k.privateKey)}
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div className="detail-actions">
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => {
                      setRenamingId(k.id)
                      setRenameValue(k.name)
                    }}
                  >
                    Rename
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => setDeleteConfirmId(k.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Generate Section */}
      <div className="form-section">
        <h3 className="form-section-title">Generate New Key</h3>
        <div className="form-group">
          <input
            className="form-input"
            placeholder="Key name"
            value={genName}
            onChange={(e) => setGenName(e.target.value)}
          />
        </div>
        <div className="form-group">
          <select
            className="form-select"
            value={genType}
            onChange={(e) => setGenType(e.target.value as KeyType)}
          >
            <option value={KeyType.K1}>K1 (Secp256k1)</option>
            <option value={KeyType.R1}>R1 (Secp256r1)</option>
            <option value={KeyType.EM}>EM (Ethereum)</option>
            <option value={KeyType.ED}>ED (Ed25519)</option>
          </select>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleGenerate}
          disabled={genLoading || !genName.trim()}
        >
          {genLoading ? "Generating..." : "Generate"}
        </button>
      </div>

      {/* Import Section */}
      <div className="form-section">
        <h3 className="form-section-title">Import Key</h3>
        <div className="form-group">
          <input
            className="form-input"
            placeholder="Key name"
            value={importName}
            onChange={(e) => setImportName(e.target.value)}
          />
        </div>
        <div className="form-group">
          <input
            className="form-input"
            placeholder="Private key (PVT_K1_... or WIF)"
            value={importPrivateKey}
            onChange={(e) => setImportPrivateKey(e.target.value)}
          />
        </div>
        <button
          className="btn btn-primary"
          onClick={handleImport}
          disabled={
            importLoading || !importName.trim() || !importPrivateKey.trim()
          }
        >
          {importLoading ? "Importing..." : "Import"}
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <Modal
          title="Delete Key"
          onClose={() => setDeleteConfirmId(null)}
        >
          <p>
            Are you sure you want to delete this key? This action cannot be
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
