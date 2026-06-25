"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase-browser"
import Link from "next/link"

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    console.log("[forgot-password] handleSubmit fired, email:", email)
    if (!email.trim()) return
    setLoading(true)
    setError(null)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${siteUrl}/reset-password`,
    })
    setLoading(false)
    if (error) {
      console.error("[forgot-password] resetPasswordForEmail error:", error)
      setError(error.message)
    } else {
      console.log("[forgot-password] email sent OK, redirectTo:", `${siteUrl}/reset-password`)
      setSent(true)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "11px 14px", borderRadius: "10px",
    border: "1.5px solid #e2e8f0", background: "white", color: "#0f172a",
    fontSize: "15px", outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  }

  return (
    <div
      style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#f0f2f5", padding: "24px",
      }}
    >
      <div style={{ width: "100%", maxWidth: "420px" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <Link href="/login" style={{ display: "inline-block", marginBottom: "12px" }}>
            <img src="/wc2026-emblem.svg" alt="Logo" style={{ width: "64px", height: "auto" }} />
          </Link>
          <h1 style={{ fontSize: "22px", fontWeight: 900, color: "#0f172a", margin: "0 0 6px" }}>
            Recuperar contraseña
          </h1>
          <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>
            Te enviaremos un enlace para restablecer tu contraseña.
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: "white", border: "1px solid #e2e8f0", borderRadius: "20px",
          padding: "28px 24px", boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        }}>
          {sent ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>📬</div>
              <p style={{ fontWeight: 700, fontSize: "16px", color: "#0f172a", marginBottom: "8px" }}>
                ¡Revisa tu correo!
              </p>
              <p style={{ fontSize: "14px", color: "#64748b", lineHeight: 1.6, marginBottom: "20px" }}>
                Si el email está registrado, te enviamos un link para cambiar tu contraseña.
              </p>
              <p style={{ fontSize: "12px", color: "#94a3b8" }}>
                Nota: Los usuarios que se registraron con Google deben usar &quot;Continuar con Google&quot; en el login.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{
                  display: "block", fontSize: "12px", fontWeight: 700,
                  letterSpacing: "0.06em", textTransform: "uppercase", color: "#64748b", marginBottom: "5px",
                }}>
                  Correo electrónico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  required
                  autoFocus
                  style={inputStyle}
                />
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
                disabled={loading}
                style={{
                  width: "100%", padding: "12px 16px", borderRadius: "10px", border: "none",
                  background: "#2563eb", color: "white", fontSize: "15px", fontWeight: 700,
                  cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1,
                  boxShadow: "0 3px 12px rgba(37,99,235,0.22)",
                }}
              >
                {loading ? "Enviando…" : "Enviar enlace de recuperación"}
              </button>
            </form>
          )}
        </div>

        {/* Back link */}
        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <Link href="/login" style={{ fontSize: "13px", color: "#64748b", textDecoration: "none" }}>
            ← Volver al inicio de sesión
          </Link>
        </div>

      </div>
    </div>
  )
}
