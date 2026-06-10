"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase-browser"
import { useRouter } from "next/navigation"
import Link from "next/link"

type Stage = "loading" | "ready" | "success" | "invalid"

export default function ResetPasswordPage() {
  const [stage, setStage]       = useState<Stage>("loading")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm]   = useState("")
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [showPass, setShowPass] = useState(false)
  const supabase = createClient()
  const router   = useRouter()

  // Exchange the recovery token on mount.
  // Supabase PKCE flow: URL has ?token_hash=...&type=recovery
  // Legacy / hash flow: URL fragment #access_token=... handled automatically by the browser client
  useEffect(() => {
    async function exchangeToken() {
      const params     = new URLSearchParams(window.location.search)
      const token_hash = params.get("token_hash")
      const type       = params.get("type")

      if (token_hash && type === "recovery") {
        const { error } = await supabase.auth.verifyOtp({ token_hash, type: "recovery" })
        if (error) {
          setStage("invalid")
        } else {
          setStage("ready")
        }
        return
      }

      // No token_hash — check if the browser client established a session from the URL hash
      // (legacy magic-link flow where Supabase redirects with #access_token=...)
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setStage("ready")
      } else {
        setStage("invalid")
      }
    }
    exchangeToken()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres")
      return
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden")
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError(error.message)
    } else {
      setStage("success")
      setTimeout(() => router.push("/login"), 3000)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "11px 14px", borderRadius: "10px",
    border: "1.5px solid #e2e8f0", background: "white", color: "#0f172a",
    fontSize: "15px", outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  }
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: "12px", fontWeight: 700,
    letterSpacing: "0.06em", textTransform: "uppercase", color: "#64748b", marginBottom: "5px",
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#f0f2f5", padding: "24px",
    }}>
      <div style={{ width: "100%", maxWidth: "420px" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <Link href="/login" style={{ display: "inline-block", marginBottom: "12px" }}>
            <img src="/wc2026-emblem.svg" alt="Logo" style={{ width: "64px", height: "auto" }} />
          </Link>
          <h1 style={{ fontSize: "22px", fontWeight: 900, color: "#0f172a", margin: "0 0 6px" }}>
            Nueva contraseña
          </h1>
          <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>
            Elige una contraseña segura para tu cuenta.
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: "white", border: "1px solid #e2e8f0", borderRadius: "20px",
          padding: "28px 24px", boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        }}>

          {/* Loading */}
          {stage === "loading" && (
            <p style={{ textAlign: "center", color: "#64748b", fontSize: "14px" }}>Verificando enlace…</p>
          )}

          {/* Invalid / expired link */}
          {stage === "invalid" && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
              <p style={{ fontWeight: 700, fontSize: "16px", color: "#0f172a", marginBottom: "8px" }}>
                Enlace inválido o expirado
              </p>
              <p style={{ fontSize: "14px", color: "#64748b", lineHeight: 1.6, marginBottom: "20px" }}>
                Este enlace de recuperación ya no es válido. Los enlaces expiran después de una hora y solo pueden usarse una vez.
              </p>
              <Link
                href="/forgot-password"
                style={{
                  display: "inline-block", padding: "10px 24px", borderRadius: "10px",
                  background: "#2563eb", color: "white", fontWeight: 700, fontSize: "14px",
                  textDecoration: "none",
                }}
              >
                Solicitar nuevo enlace
              </Link>
            </div>
          )}

          {/* Ready — show password form */}
          {stage === "ready" && (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "5px" }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Nueva contraseña</label>
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    style={{ fontSize: "11px", color: "#64748b", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    {showPass ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  autoFocus
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Confirmar contraseña</label>
                <input
                  type={showPass ? "text" : "password"}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repite la contraseña"
                  required
                  minLength={6}
                  style={{
                    ...inputStyle,
                    borderColor: confirm && confirm !== password ? "#fca5a5" : "#e2e8f0",
                  }}
                />
                {confirm && confirm !== password && (
                  <p style={{ fontSize: "12px", color: "#dc2626", marginTop: "4px" }}>Las contraseñas no coinciden</p>
                )}
              </div>

              {error && (
                <div style={{
                  background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px",
                  padding: "9px 12px", fontSize: "13px", color: "#dc2626", textAlign: "center",
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !password || password !== confirm}
                style={{
                  width: "100%", padding: "12px 16px", borderRadius: "10px", border: "none",
                  background: "#2563eb", color: "white", fontSize: "15px", fontWeight: 700,
                  cursor: (loading || !password || password !== confirm) ? "not-allowed" : "pointer",
                  opacity: (loading || !password || password !== confirm) ? 0.5 : 1,
                  boxShadow: "0 3px 12px rgba(37,99,235,0.22)",
                  marginTop: "4px",
                }}
              >
                {loading ? "Guardando…" : "Guardar nueva contraseña"}
              </button>
            </form>
          )}

          {/* Success */}
          {stage === "success" && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>✅</div>
              <p style={{ fontWeight: 700, fontSize: "16px", color: "#0f172a", marginBottom: "8px" }}>
                ¡Contraseña actualizada!
              </p>
              <p style={{ fontSize: "14px", color: "#64748b", lineHeight: 1.6 }}>
                Tu contraseña ha sido cambiada. Redirigiendo al inicio de sesión…
              </p>
            </div>
          )}

        </div>

        {/* Back link — only when not loading and not success */}
        {stage !== "success" && (
          <div style={{ textAlign: "center", marginTop: "20px" }}>
            <Link href="/login" style={{ fontSize: "13px", color: "#64748b", textDecoration: "none" }}>
              ← Volver al inicio de sesión
            </Link>
          </div>
        )}

      </div>
    </div>
  )
}
