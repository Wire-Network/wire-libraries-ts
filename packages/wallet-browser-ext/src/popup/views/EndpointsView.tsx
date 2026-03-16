import { useState } from "react"
import { useAppDispatch, useAppSelector } from "../Hooks"
import {
  addEndpoint,
  updateEndpoint,
  removeEndpoint,
  navigate,
  persistState,
  showToast,
} from "../slices/WalletSlice"
import { isValidEndpointName, isValidUrl } from "../../Validation"
import { ChainKind } from "../../Types"
import { Modal } from "../components/Modal"
import type { ChainEndpoint } from "../../Types"

function generateId(): string {
  return crypto.randomUUID()
}

export function EndpointsView() {
  const dispatch = useAppDispatch()
  const { endpoints } = useAppSelector((state) => state.wallet)

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Add form state
  const [addName, setAddName] = useState("")
  const [addKind, setAddKind] = useState<ChainKind>(ChainKind.WIRE)
  const [addUrl, setAddUrl] = useState("http://localhost:8888")
  const [addError, setAddError] = useState("")

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editKind, setEditKind] = useState<ChainKind>(ChainKind.WIRE)
  const [editUrl, setEditUrl] = useState("")
  const [editError, setEditError] = useState("")

  const existingNames = endpoints.map((e) => e.name)

  function handleAdd() {
    setAddError("")

    if (
      !isValidEndpointName(
        addName,
        existingNames
      )
    ) {
      setAddError("Invalid or duplicate endpoint name")
      return
    }

    if (!isValidUrl(addUrl)) {
      setAddError("Invalid URL (must be http or https)")
      return
    }

    const endpoint: ChainEndpoint = {
      id: generateId(),
      name: addName.trim(),
      kind: addKind,
      url: addUrl.trim(),
    }

    dispatch(addEndpoint(endpoint))
    dispatch(persistState())
    dispatch(
      showToast({ message: "Endpoint added successfully", type: "success" })
    )
    setAddName("")
    setAddUrl("http://localhost:8888")
  }

  function startEdit(ep: ChainEndpoint) {
    setEditingId(ep.id)
    setEditName(ep.name)
    setEditKind(ep.kind)
    setEditUrl(ep.url)
    setEditError("")
  }

  function handleSaveEdit() {
    if (!editingId) return
    setEditError("")

    const otherNames = endpoints
      .filter((e) => e.id !== editingId)
      .map((e) => e.name)

    if (!isValidEndpointName(editName, otherNames)) {
      setEditError("Invalid or duplicate endpoint name")
      return
    }

    if (!isValidUrl(editUrl)) {
      setEditError("Invalid URL (must be http or https)")
      return
    }

    dispatch(
      updateEndpoint({
        id: editingId,
        name: editName.trim(),
        kind: editKind,
        url: editUrl.trim(),
      })
    )
    dispatch(persistState())
    dispatch(
      showToast({ message: "Endpoint updated", type: "success" })
    )
    setEditingId(null)
  }

  function handleDelete(id: string) {
    dispatch(removeEndpoint(id))
    dispatch(persistState())
    dispatch(showToast({ message: "Endpoint deleted", type: "success" }))
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
        <h2 className="view-title">Endpoints</h2>
      </div>

      {/* Endpoint List */}
      <div className="list-container">
        {endpoints.length === 0 && (
          <p className="text-secondary text-center">No endpoints yet</p>
        )}
        {endpoints.map((ep) => (
          <div key={ep.id} className="list-item">
            {editingId === ep.id ? (
              <div className="list-item-edit">
                <div className="form-group">
                  <input
                    className="form-input"
                    placeholder="Name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <select
                    className="form-select"
                    value={editKind}
                    onChange={(e) =>
                      setEditKind(e.target.value as ChainKind)
                    }
                  >
                    <option value={ChainKind.WIRE}>WIRE</option>
                    <option value={ChainKind.ETHEREUM}>ETHEREUM</option>
                    <option value={ChainKind.SOLANA}>SOLANA</option>
                    <option value={ChainKind.SUI}>SUI</option>
                  </select>
                </div>
                <div className="form-group">
                  <input
                    className="form-input"
                    placeholder="URL"
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                  />
                </div>
                {editError && <p className="form-error">{editError}</p>}
                <div className="detail-actions">
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={handleSaveEdit}
                  >
                    Save
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="list-item-header">
                <div className="list-item-info">
                  <span className="list-item-name">{ep.name}</span>
                  <span className="badge badge-endpoint">{ep.kind}</span>
                </div>
                <span className="list-item-sub">{ep.url}</span>
                <div className="detail-actions">
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => startEdit(ep)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => setDeleteConfirmId(ep.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Form */}
      <div className="form-section">
        <h3 className="form-section-title">Add Endpoint</h3>
        <div className="form-group">
          <input
            className="form-input"
            placeholder="Endpoint name"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
          />
        </div>
        <div className="form-group">
          <select
            className="form-select"
            value={addKind}
            onChange={(e) => setAddKind(e.target.value as ChainKind)}
          >
            <option value={ChainKind.WIRE}>WIRE</option>
            <option value={ChainKind.ETHEREUM}>ETHEREUM</option>
            <option value={ChainKind.SOLANA}>SOLANA</option>
            <option value={ChainKind.SUI}>SUI</option>
          </select>
        </div>
        <div className="form-group">
          <input
            className="form-input"
            placeholder="URL"
            value={addUrl}
            onChange={(e) => setAddUrl(e.target.value)}
          />
        </div>
        {addError && <p className="form-error">{addError}</p>}
        <button
          className="btn btn-primary"
          onClick={handleAdd}
          disabled={!addName.trim() || !addUrl.trim()}
        >
          Add Endpoint
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <Modal
          title="Delete Endpoint"
          onClose={() => setDeleteConfirmId(null)}
        >
          <p>
            Are you sure you want to delete this endpoint? It will be removed
            from all accounts.
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
