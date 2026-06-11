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
  const [debugInfo, setDebugInfo] = useState<string | null>(null)
  const supabase = createClient()
  const router   = useRouter()

  useEffect(() => {
    // Capture URL state immediately — React Router may strip params before async work
    const search   = window.location.search
    const hash     = window.location.hash
    const params   = new URLSearchParams(search)
    const code       = params.get("code")
    const token_hash = params.get("token_hash")
    const type       = params.get("type")
    const errorParam = params.get("error")
    const errorDesc  = params.get("error_description")

    const info = `search=${search || "(vacío)"} hash=${hash ? "(presente)" : "(vacío)"}`
    setDebugInfo(info)
    console.log("[reset-password] URL params:", info)

    // Supabase error in redirect (e.g. expired OTP from server side)
    if (errorParam) {
      console.error("[reset-password] Supabase error in URL:", errorParam, errorDesc)
      setStage("invalid")
      return
    }

    async function exchangeToken() {
      // ── Flow 1: PKCE — @supabase/ssr default ──────────────────────────────
      // Supabase redirects with ?code=... after verifying the OTP server-side.
      // Must call exchangeCodeForSession to obtain the session.
      if (code) {
        console.log("[reset-password] Flow 1: PKCE code exchange")
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          console.error("[reset-password] exchangeCodeForSession failed:", error.message)
          setStage("invalid")
        } else {
          console.log("[reset-password] PKCE exchange OK → ready")
          setStage("ready")
        }
        return
      }

      // ── Flow 2: Email OTP — token_hash in query string ────────────────────
      // Used when Supabase email templates use the newer OTP format.
      if (token_hash && type === "recovery") {
        console.log("[reset-password] Flow 2: verifyOtp with token_hash")
        const { error } = await supabase.auth.verifyOtp({ token_hash, type: "recovery" })
        if (error) {
          console.error("[reset-password] verifyOtp failed:", error.message)
          setStage("invalid")
        } else {
          console.log("[reset-password] verifyOtp OK → ready")
          setStage("ready")
        }
        return
      }

      // ── Flow 3: Implicit hash — #access_token=...&type=recovery ──────────
      // Older Supabase projects redirect with the session in the URL hash.
      // createBrowserClient processes this automatically via detectSessionInUrl.
      // Listen for PASSWORD_RECOVERY event, then fall back to getSession().
      console.log("[reset-password] Flow 3: waiting for PASSWORD_RECOVERY event / hash session")

      let resolved = false
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        console.log("[reset-password] onAuthStateChange:", event, session ? "session present" : "no session")
        if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session && !resolved) {
          resolved = true
          subscription.unsubscribe()
          console.log("[reset-password] Auth event fired → ready")
          setStage("ready")
        }
      })

      // Also check immediately in case the event already fired before we subscribed
      const { data: { session } } = await supabase.auth.getSession()
      if (session && !resolved) {
        resolved = true
        subscription.unsubscribe()
        console.log("[reset-password] getSession found existing session → ready")
        setStage("ready")
        return
      }

      // Give the auth state change event 3 seconds to fire
      setTimeout(() => {
        if (!resolved) {
          resolved = true
          subscription.unsubscribe()
          console.warn("[reset-password] No session found after 3s → invalid")
          setStage("invalid")
        }
      }, 3000)
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
      console.error("[reset-password] updateUser failed:", error.message)
      setError(error.message)
    } else {
      console.log("[reset-password] password updated OK")
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
            <div style={{ textAlign: "center" }}>
              <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "8px" }}>Verificando enlace…</p>
              <p style={{ color: "#94a3b8", fontSize: "11px" }}>Esto puede tardar unos segundos.</p>
            </div>
          )}

          {/* Invalid / expired link */}
          {stage === "invalid" && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
              <p style={{ fontWeight: 700, fontSize: "16px", color: "#0f172a", marginBottom: "8px" }}>
                Enlace inválido o expirado
              </p>
              <p style={{ fontSize: "14px", color: "#64748b", lineHeight: 1.6, marginBottom: "20px" }}>
                Este enlace ya no es válido. Los enlaces expiran en 1 hora y solo pueden usarse una vez.
              </p>
              {debugInfo && (
                <p style={{ fontSize: "10px", color: "#94a3b8", marginBottom: "16px", fontFamily: "monospace", wordBreak: "break-all" }}>
                  debug: {debugInfo}
                </p>
              )}
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
