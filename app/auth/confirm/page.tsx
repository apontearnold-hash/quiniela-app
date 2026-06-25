"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase-browser"
import Link from "next/link"

type Stage = "waiting" | "loading" | "error" | "missing"

export default function AuthConfirmPage() {
  const [stage, setStage]     = useState<Stage>("waiting")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [tokenHash, setTokenHash] = useState<string | null>(null)
  const [type, setType]       = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const th = params.get("token_hash")
    const t  = params.get("type")
    console.log("[auth/confirm] token_hash:", th ? "presente" : "falta", "type:", t)
    setTokenHash(th)
    setType(t)
    if (!th || t !== "recovery") setStage("missing")
  }, [])

  async function handleConfirm() {
    if (!tokenHash || type !== "recovery") return
    setStage("loading")
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" })
    if (error) {
      console.error("[auth/confirm] verifyOtp error:", error.message)
      setErrorMsg(error.message)
      setStage("error")
    } else {
      console.log("[auth/confirm] verifyOtp OK → /reset-password")
      window.location.assign("/reset-password")
    }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#f0f2f5", padding: "24px",
    }}>
      <div style={{ width: "100%", maxWidth: "420px" }}>

        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <Link href="/login" style={{ display: "inline-block", marginBottom: "12px" }}>
            <img src="/wc2026-emblem.svg" alt="Logo" style={{ width: "64px", height: "auto" }} />
          </Link>
          <h1 style={{ fontSize: "22px", fontWeight: 900, color: "#0f172a", margin: "0 0 6px" }}>
            Cambiar contraseña
          </h1>
          <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>
            Confirma tu identidad para continuar.
          </p>
        </div>

        <div style={{
          background: "white", border: "1px solid #e2e8f0", borderRadius: "20px",
          padding: "28px 24px", boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
          textAlign: "center",
        }}>

          {/* Link válido — pedir confirmación del usuario */}
          {(stage === "waiting" || stage === "loading") && (
            <>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔑</div>
              <p style={{ fontWeight: 700, fontSize: "16px", color: "#0f172a", marginBottom: "8px" }}>
                ¿Quieres cambiar tu contraseña?
              </p>
              <p style={{ fontSize: "14px", color: "#64748b", lineHeight: 1.6, marginBottom: "24px" }}>
                Haz click en el botón para continuar al formulario de nueva contraseña.
              </p>
              <button
                onClick={handleConfirm}
                disabled={stage === "loading"}
                style={{
                  width: "100%", padding: "12px 16px", borderRadius: "10px", border: "none",
                  background: "#2563eb", color: "white", fontSize: "15px", fontWeight: 700,
                  cursor: stage === "loading" ? "not-allowed" : "pointer",
                  opacity: stage === "loading" ? 0.6 : 1,
                  boxShadow: "0 3px 12px rgba(37,99,235,0.22)",
                }}
              >
                {stage === "loading" ? "Verificando…" : "Sí, cambiar mi contraseña"}
              </button>
            </>
          )}

          {/* Error al verificar */}
          {stage === "error" && (
            <>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
              <p style={{ fontWeight: 700, fontSize: "16px", color: "#0f172a", marginBottom: "8px" }}>
                Enlace inválido o expirado
              </p>
              <p style={{ fontSize: "14px", color: "#64748b", lineHeight: 1.6, marginBottom: "8px" }}>
                Los enlaces expiran en 1 hora y solo pueden usarse una vez.
              </p>
              {errorMsg && (
                <p style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "20px", fontFamily: "monospace" }}>
                  {errorMsg}
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
            </>
          )}

          {/* Token faltante — link mal formado */}
          {stage === "missing" && (
            <>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>❌</div>
              <p style={{ fontWeight: 700, fontSize: "16px", color: "#0f172a", marginBottom: "8px" }}>
                Enlace incompleto
              </p>
              <p style={{ fontSize: "14px", color: "#64748b", lineHeight: 1.6, marginBottom: "20px" }}>
                El link no contiene la información necesaria. Solicita un nuevo enlace de recuperación.
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
            </>
          )}

        </div>

        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <Link href="/login" style={{ fontSize: "13px", color: "#64748b", textDecoration: "none" }}>
            ← Volver al inicio de sesión
          </Link>
        </div>

      </div>
    </div>
  )
}
