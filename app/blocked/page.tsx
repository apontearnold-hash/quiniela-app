"use client"

import { createClient } from "@/lib/supabase-browser"
import { useRouter } from "next/navigation"

export default function BlockedPage() {
  const router = useRouter()
  const supabase = createClient()

  async function signOut() {
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "linear-gradient(135deg, #0a1208, #152a1a)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-8 text-center"
        style={{ background: "linear-gradient(135deg, #1a0808, #2a1212)", border: "1px solid #542a2a" }}
      >
        <div className="text-5xl mb-4">🚫</div>
        <h1 className="text-white font-black text-2xl mb-2">Acceso bloqueado</h1>
        <p className="text-red-400 text-sm mb-6">
          Tu acceso a esta aplicación ha sido bloqueado.
          Contacta al administrador si crees que esto es un error.
        </p>
        <button
          onClick={signOut}
          className="py-2 px-5 rounded-xl text-sm font-bold text-black"
          style={{ background: "linear-gradient(135deg, #F5C518, #FFD700)" }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
