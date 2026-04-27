"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function JoinLeagueButton() {
  const router = useRouter()
  const [open, setOpen]       = useState(false)
  const [code, setCode]       = useState("")
  const [loading, setLoading] = useState(false)
  const [status, setStatus]   = useState<{ type: "error" | "success"; msg: string } | null>(null)

  function normalize(raw: string) {
    return raw.replace(/\s+/g, "").toUpperCase()
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const normalized = normalize(code)
    if (!normalized) return
    setLoading(true)
    setStatus(null)
    try {
      const res  = await fetch("/api/join-league", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalized }),
      })
      const data = await res.json()

      if (res.status === 409) {
        setStatus({ type: "error", msg: "Ya perteneces a esta liga." })
      } else if (!res.ok) {
        const msgs: Record<string, string> = {
          invalid_code:    "Código inválido o no encontrado.",
          inactive_code:   "Este código ya no está activo.",
          code_exhausted:  "Este código ya alcanzó su límite.",
          inactive_league: "Esta liga no está activa.",
        }
        setStatus({ type: "error", msg: msgs[data.error] ?? "Error al unirse. Intenta de nuevo." })
      } else {
        document.cookie = `selected_pool=${data.pool.id}; path=/; max-age=31536000; SameSite=Lax`
        setStatus({ type: "success", msg: `¡Te uniste a ${data.pool.name}!` })
        setTimeout(() => { setOpen(false); setCode(""); setStatus(null); router.refresh() }, 1500)
      }
    } catch {
      setStatus({ type: "error", msg: "Error al unirse. Intenta de nuevo." })
    } finally {
      setLoading(false)
    }
  }

  function handleClose() { setOpen(false); setCode(""); setStatus(null) }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          padding: "6px 12px",
          borderRadius: "8px",
          border: "1px solid #d1d5db",
          background: "white",
          color: "#374151",
          fontSize: "12px",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <span style={{ color: "#F5C518", fontWeight: 900 }}>+</span>
        <span>Unirme a otra liga</span>
      </button>

      {open && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 50,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "16px", background: "rgba(0,0,0,0.45)",
          }}
          onClick={e => { if (e.target === e.currentTarget) handleClose() }}
        >
          <div style={{
            width: "100%", maxWidth: "384px", borderRadius: "16px",
            background: "white", boxShadow: "0 25px 50px rgba(0,0,0,0.25)", padding: "24px",
          }}>
            <h2 style={{ fontSize: "18px", fontWeight: 900, color: "#111827", margin: "0 0 4px" }}>
              Unirme a otra liga
            </h2>
            <p style={{ fontSize: "14px", color: "#6b7280", margin: "0 0 16px" }}>
              Ingresa el código de invitación para unirte a una liga.
            </p>

            <form onSubmit={handleJoin} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <input
                type="text"
                value={code}
                onChange={e => { setCode(e.target.value.replace(/\s+/g, " ").toUpperCase()); setStatus(null) }}
                placeholder="CÓDIGO"
                maxLength={20}
                autoFocus
                disabled={loading}
                style={{
                  width: "100%", padding: "12px 16px", borderRadius: "12px",
                  border: "1px solid #e5e7eb", textAlign: "center",
                  fontSize: "20px", fontWeight: 700, letterSpacing: "0.15em",
                  fontFamily: "monospace", textTransform: "uppercase",
                  color: "#111827", outline: "none", boxSizing: "border-box",
                  opacity: loading ? 0.5 : 1,
                }}
              />
              <p style={{ fontSize: "11px", color: "#9ca3af", textAlign: "center", margin: "-4px 0 0" }}>
                El código no distingue mayúsculas ni espacios
              </p>

              {status && (
                <p style={{
                  textAlign: "center", fontSize: "14px", fontWeight: 500,
                  color: status.type === "success" ? "#16a34a" : "#ef4444",
                  margin: 0,
                }}>
                  {status.msg}
                </p>
              )}

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={handleClose}
                  style={{
                    flex: 1, padding: "10px", borderRadius: "12px",
                    border: "1px solid #e5e7eb", background: "white",
                    fontSize: "14px", fontWeight: 600, color: "#4b5563", cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading || !normalize(code)}
                  style={{
                    flex: 1, padding: "10px", borderRadius: "12px",
                    border: "none", background: "#F5C518",
                    fontSize: "14px", fontWeight: 700, color: "#111827",
                    cursor: loading || !normalize(code) ? "not-allowed" : "pointer",
                    opacity: loading || !normalize(code) ? 0.5 : 1,
                  }}
                >
                  {loading ? "Uniéndome…" : "Unirme"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
