"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase-browser"
import { useRouter } from "next/navigation"

export default function LoginForm() {
  const [mode, setMode] = useState<"login" | "register">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [inviteCode, setInviteCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  // Google login — requires invite code in register mode
  async function handleGoogleLogin() {
    setError(null)

    if (mode === "register") {
      if (!inviteCode.trim()) {
        setError("Ingresa tu código de invitación antes de continuar con Google")
        return
      }
      // Validate code server-side before triggering OAuth
      setLoading(true)
      try {
        const res = await fetch("/api/auth/validate-invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invite_code: inviteCode.trim() }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error ?? "Código inválido")
          setLoading(false)
          return
        }
      } catch {
        setError("Error al verificar el código. Intenta de nuevo.")
        setLoading(false)
        return
      }

      // Include invite code in the OAuth redirect URL
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?invite_code=${encodeURIComponent(inviteCode.trim().toUpperCase())}`,
        },
      })
      if (error) { setError(error.message); setLoading(false) }
    } else {
      // Login mode — no invite code needed (existing user)
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
        setError("El código de invitación es requerido")
        setLoading(false)
        return
      }
      try {
        // Create account (invite code validated server-side)
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name, invite_code: inviteCode.trim() }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error ?? "Error al crear la cuenta")
          setLoading(false)
          return
        }
        // Account created and confirmed — sign in immediately
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
        if (signInErr) {
          setError("Cuenta creada, pero no se pudo iniciar sesión automáticamente. Inicia sesión manualmente.")
          setLoading(false)
          return
        }
        router.push("/dashboard")
        router.refresh()
      } catch {
        setError("Error de conexión. Intenta de nuevo.")
        setLoading(false)
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        const msg = error.message.toLowerCase()
        if (msg.includes("invalid login credentials") || msg.includes("invalid credentials")) {
          setError("Correo o contraseña incorrectos")
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

  return (
    <div className="flex flex-col gap-6">

      {/* URL error messages (from OAuth callback) */}
      {errorFromUrl === "invite_required" && (
        <div className="p-3 rounded-xl text-sm text-red-400 text-center"
          style={{ background: "rgba(100,0,0,0.2)", border: "1px solid #7a1a1a" }}>
          Se requiere un código de invitación para registrarse. Cambia a &quot;Registrarse&quot; e ingresa tu código.
        </div>
      )}
      {errorFromUrl === "invite_invalid" && (
        <div className="p-3 rounded-xl text-sm text-red-400 text-center"
          style={{ background: "rgba(100,0,0,0.2)", border: "1px solid #7a1a1a" }}>
          El código de invitación es inválido o ya no está activo.
        </div>
      )}

      {/* Mode toggle */}
      <div className="flex rounded-xl overflow-hidden border border-[#2a5438]">
        <button
          type="button"
          onClick={() => { setMode("login"); setError(null) }}
          className={`flex-1 py-2 text-sm font-semibold transition-colors ${mode === "login" ? "bg-[#F5C518] text-black" : "text-[#7ab88a] hover:text-white"}`}
        >
          Iniciar Sesión
        </button>
        <button
          type="button"
          onClick={() => { setMode("register"); setError(null) }}
          className={`flex-1 py-2 text-sm font-semibold transition-colors ${mode === "register" ? "bg-[#F5C518] text-black" : "text-[#7ab88a] hover:text-white"}`}
        >
          Registrarse
        </button>
      </div>

      {/* Invite code — shown in register mode, applies to both email and Google */}
      {mode === "register" && (
        <div>
          <label className="block text-[#F5C518] text-xs uppercase tracking-widest mb-1 font-bold">
            Código de Invitación *
          </label>
          <input
            type="text"
            value={inviteCode}
            onChange={e => setInviteCode(e.target.value.toUpperCase())}
            placeholder="ej. MUNDIAL2026"
            required
            autoComplete="off"
            className="w-full px-4 py-3 rounded-xl text-white placeholder-[#4a7a5a] focus:outline-none focus:ring-2 focus:ring-[#F5C518] font-mono uppercase tracking-widest"
            style={{ background: '#0a1208', border: '1px solid #F5C518' }}
          />
          <p className="text-[#4a7a5a] text-xs mt-1">Este código aplica tanto para registro con correo como con Google.</p>
        </div>
      )}

      {/* Google Button */}
      <button
        onClick={handleGoogleLogin}
        disabled={loading}
        className="flex items-center justify-center gap-3 w-full py-3 px-6 rounded-xl font-semibold text-white transition-all duration-200 hover:opacity-90 disabled:opacity-50"
        style={{ background: '#4285F4', border: '1px solid #3367D6' }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        {mode === "register" ? "Registrarse con Google" : "Continuar con Google"}
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-[#2a5438]" />
        <span className="text-[#7ab88a] text-sm">o</span>
        <div className="flex-1 h-px bg-[#2a5438]" />
      </div>

      {/* Email Form */}
      <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
        {mode === "register" && (
          <div>
            <label className="block text-[#7ab88a] text-xs uppercase tracking-widest mb-1 font-medium">
              Nombre
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Tu nombre"
              required
              className="w-full px-4 py-3 rounded-xl text-white placeholder-[#4a7a5a] focus:outline-none focus:ring-2 focus:ring-[#F5C518]"
              style={{ background: '#0a1208', border: '1px solid #2a5438' }}
            />
          </div>
        )}
        <div>
          <label className="block text-[#7ab88a] text-xs uppercase tracking-widest mb-1 font-medium">
            Correo electrónico
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            required
            className="w-full px-4 py-3 rounded-xl text-white placeholder-[#4a7a5a] focus:outline-none focus:ring-2 focus:ring-[#F5C518]"
            style={{ background: '#0a1208', border: '1px solid #2a5438' }}
          />
        </div>
        <div>
          <label className="block text-[#7ab88a] text-xs uppercase tracking-widest mb-1 font-medium">
            Contraseña
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={6}
            className="w-full px-4 py-3 rounded-xl text-white placeholder-[#4a7a5a] focus:outline-none focus:ring-2 focus:ring-[#F5C518]"
            style={{ background: '#0a1208', border: '1px solid #2a5438' }}
          />
        </div>

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-6 rounded-xl font-bold text-black uppercase tracking-wide transition-all duration-200 hover:opacity-90 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #F5C518, #FFD700)' }}
        >
          {loading ? "..." : mode === "login" ? "Entrar" : "Crear Cuenta"}
        </button>
      </form>
    </div>
  )
}
