"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase-browser"
import { useRouter } from "next/navigation"
import { useLanguage } from "@/components/LangProvider"
import Link from "next/link"

// ── Bilingual copy (login-specific, not in global i18n) ───────────────────────

const COPY = {
  es: {
    eyebrow:      "Quiniela",
    title:        "Mundial 2026",
    disclaimer:   "Juego no oficial de predicciones",
    subtitle:     "Inicia sesión para participar",
    tabLogin:     "Iniciar sesión",
    tabRegister:  "Registrarse",
    inviteLabel:  "Código de invitación *",
    invitePH:     "ej. MUNDIAL2026",
    inviteHint:   "Este código aplica tanto para registro con correo como con Google.",
    googleLogin:  "Continuar con Google",
    googleReg:    "Registrarse con Google",
    divider:      "o",
    nameLabel:    "Nombre",
    namePH:       "Tu nombre",
    emailLabel:   "Correo electrónico",
    emailPH:      "tu@correo.com",
    passLabel:    "Contraseña",
    passPH:       "••••••••",
    submitLogin:  "Entrar",
    submitReg:    "Crear cuenta",
    loading:      "...",
    errInviteReq: "Ingresa tu código de invitación antes de continuar con Google",
    errVerify:    "Error al verificar el código. Intenta de nuevo.",
    errConn:      "Error de conexión. Intenta de nuevo.",
    errCreated:   "Cuenta creada, pero no se pudo iniciar sesión automáticamente. Inicia sesión manualmente.",
    errInviteField: "El código de invitación es requerido",
    errDefault:   "Error al crear la cuenta",
    errBadCreds:  "Correo o contraseña incorrectos",
    urlErrInvReq: "Se requiere un código de invitación para registrarse. Cambia a \"Registrarse\" e ingresa tu código.",
    urlErrInvInv: "El código de invitación es inválido o ya no está activo.",
    langBtn:      "EN",
    langLabel:    "Cambiar idioma",
    backToHome:   "← Volver al inicio",
  },
  en: {
    eyebrow:      "Prediction Game",
    title:        "World Cup 2026",
    disclaimer:   "Unofficial prediction game",
    subtitle:     "Sign in to participate",
    tabLogin:     "Sign in",
    tabRegister:  "Register",
    inviteLabel:  "Invite code *",
    invitePH:     "e.g. MUNDIAL2026",
    inviteHint:   "This code applies to both email and Google registration.",
    googleLogin:  "Continue with Google",
    googleReg:    "Sign up with Google",
    divider:      "or",
    nameLabel:    "Name",
    namePH:       "Your name",
    emailLabel:   "Email",
    emailPH:      "you@email.com",
    passLabel:    "Password",
    passPH:       "••••••••",
    submitLogin:  "Sign in",
    submitReg:    "Create account",
    loading:      "...",
    errInviteReq: "Enter your invite code before continuing with Google",
    errVerify:    "Error verifying the code. Please try again.",
    errConn:      "Connection error. Please try again.",
    errCreated:   "Account created, but auto sign-in failed. Please sign in manually.",
    errInviteField: "Invite code is required",
    errDefault:   "Error creating account",
    errBadCreds:  "Incorrect email or password",
    urlErrInvReq: "An invite code is required to register. Switch to \"Register\" and enter your code.",
    urlErrInvInv: "The invite code is invalid or no longer active.",
    langBtn:      "ES",
    langLabel:    "Change language",
    backToHome:   "← Back to home",
  },
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LoginForm() {
  const [mode, setMode]           = useState<"login" | "register">("login")
  const [email, setEmail]         = useState("")
  const [password, setPassword]   = useState("")
  const [name, setName]           = useState("")
  const [inviteCode, setInviteCode] = useState("")
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const router   = useRouter()
  const supabase = createClient()
  const { lang, setLang } = useLanguage()
  const c = COPY[lang] ?? COPY.es

  // ── Auth handlers (UNCHANGED) ─────────────────────────────────────────────

  async function handleGoogleLogin() {
    setError(null)

    if (mode === "register") {
      if (!inviteCode.trim()) {
        setError(c.errInviteReq)
        return
      }
      setLoading(true)
      try {
        const res = await fetch("/api/auth/validate-invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invite_code: inviteCode.trim() }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error ?? c.errDefault)
          setLoading(false)
          return
        }
      } catch {
        setError(c.errVerify)
        setLoading(false)
        return
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?invite_code=${encodeURIComponent(inviteCode.trim().toUpperCase())}`,
        },
      })
      if (error) { setError(error.message); setLoading(false) }
    } else {
      setLoading(true)
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) { setError(error.message); setLoading(false) }
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (mode === "register") {
      if (!inviteCode.trim()) {
        setError(c.errInviteField)
        setLoading(false)
        return
      }
      try {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name, invite_code: inviteCode.trim() }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error ?? c.errDefault)
          setLoading(false)
          return
        }
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
        if (signInErr) {
          setError(c.errCreated)
          setLoading(false)
          return
        }
        router.push("/dashboard")
        router.refresh()
      } catch {
        setError(c.errConn)
        setLoading(false)
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        const msg = error.message.toLowerCase()
        if (msg.includes("invalid login credentials") || msg.includes("invalid credentials")) {
          setError(c.errBadCreds)
        } else {
          setError(error.message)
        }
        setLoading(false)
        return
      }
      router.push("/dashboard")
      router.refresh()
    }
  }

  const errorFromUrl = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("error")
    : null

  // ── Shared input style ────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 14px",
    borderRadius: "10px",
    border: "1.5px solid #e2e8f0",
    background: "white",
    color: "#0f172a",
    fontSize: "15px",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  }

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#64748b",
    marginBottom: "5px",
  }

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ width: "100%", maxWidth: "420px" }}>

      {/* ── Lang toggle (top-right) ── */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "24px" }}>
        <button
          onClick={() => setLang(lang === "es" ? "en" : "es")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            padding: "6px 14px",
            borderRadius: "999px",
            border: "1.5px solid #cbd5e1",
            background: "white",
            color: "#334155",
            fontSize: "12px",
            fontWeight: 700,
            cursor: "pointer",
            letterSpacing: "0.03em",
          }}
        >
          <span style={{ color: "#2563eb" }}>{c.langBtn}</span>
          <span style={{ color: "#94a3b8", fontSize: "10px" }}>·</span>
          <span>{c.langLabel}</span>
        </button>
      </div>

      {/* ── Header ── */}
      <div style={{ textAlign: "center", marginBottom: "28px" }}>
        <Link href="/" style={{ display: "inline-block", marginBottom: "12px" }}>
          <img
            src="/wc2026-emblem.svg"
            alt="FIFA World Cup 2026"
            style={{ width: "72px", height: "auto", display: "block" }}
          />
        </Link>
        <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#94a3b8", margin: "0 0 4px" }}>
          {c.eyebrow}
        </p>
        <h1 style={{ fontSize: "26px", fontWeight: 900, color: "#0f172a", letterSpacing: "-0.02em", margin: "0 0 4px" }}>
          {c.title}
        </h1>
        <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 2px" }}>
          {c.subtitle}
        </p>
        <p style={{ fontSize: "11px", color: "#94a3b8", margin: 0 }}>
          {c.disclaimer}
        </p>
      </div>

      {/* ── Card ── */}
      <div style={{
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: "20px",
        padding: "28px 24px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)",
      }}>

        {/* URL error banners */}
        {errorFromUrl === "invite_required" && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px", color: "#dc2626", textAlign: "center" }}>
            {c.urlErrInvReq}
          </div>
        )}
        {errorFromUrl === "invite_invalid" && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px", color: "#dc2626", textAlign: "center" }}>
            {c.urlErrInvInv}
          </div>
        )}

        {/* Mode tabs */}
        <div style={{ display: "flex", background: "#f1f5f9", borderRadius: "12px", padding: "4px", marginBottom: "20px" }}>
          {(["login", "register"] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(null) }}
              style={{
                flex: 1,
                padding: "8px 0",
                borderRadius: "9px",
                border: "none",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.15s",
                background: mode === m ? "white" : "transparent",
                color: mode === m ? "#0f172a" : "#64748b",
                boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,0.10)" : "none",
              }}
            >
              {m === "login" ? c.tabLogin : c.tabRegister}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>

          {/* Invite code (register mode) */}
          {mode === "register" && (
            <div style={{ marginBottom: "14px" }}>
              <label style={{ ...labelStyle, color: "#2563eb" }}>{c.inviteLabel}</label>
              <input
                type="text"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value.toUpperCase())}
                placeholder={c.invitePH}
                required
                autoComplete="off"
                style={{ ...inputStyle, fontFamily: "monospace", letterSpacing: "0.1em", fontWeight: 700, border: "1.5px solid #93c5fd" }}
              />
              <p style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>{c.inviteHint}</p>
            </div>
          )}

          {/* Google button */}
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              width: "100%",
              padding: "11px 16px",
              borderRadius: "10px",
              border: "1.5px solid #e2e8f0",
              background: "white",
              color: "#334155",
              fontSize: "14px",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.5 : 1,
              marginBottom: "16px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {mode === "register" ? c.googleReg : c.googleLogin}
          </button>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
            <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
            <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 500 }}>{c.divider}</span>
            <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
          </div>

          {/* Email form */}
          <form onSubmit={handleEmailSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

            {mode === "register" && (
              <div>
                <label style={labelStyle}>{c.nameLabel}</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={c.namePH}
                  required
                  style={inputStyle}
                />
              </div>
            )}

            <div>
              <label style={labelStyle}>{c.emailLabel}</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={c.emailPH}
                required
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>{c.passLabel}</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={c.passPH}
                required
                minLength={6}
                style={inputStyle}
              />
            </div>

            {error && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "9px 12px", fontSize: "13px", color: "#dc2626", textAlign: "center" }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "10px",
                border: "none",
                background: "#2563eb",
                color: "white",
                fontSize: "15px",
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.5 : 1,
                marginTop: "4px",
                boxShadow: "0 3px 12px rgba(37,99,235,0.22)",
              }}
            >
              {loading ? c.loading : mode === "login" ? c.submitLogin : c.submitReg}
            </button>

          </form>
        </div>
      </div>

      {/* Back link */}
      <div style={{ textAlign: "center", marginTop: "20px" }}>
        <Link href="/" style={{ fontSize: "13px", color: "#64748b", textDecoration: "none" }}>
          {c.backToHome}
        </Link>
      </div>

    </div>
  )
}
