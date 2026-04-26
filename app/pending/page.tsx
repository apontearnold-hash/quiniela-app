"use client"

import { createClient } from "@/lib/supabase-browser"
import { useRouter } from "next/navigation"

export default function PendingPage() {
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
        style={{ background: "linear-gradient(135deg, #152a1a, #1a3322)", border: "1px solid #2a5438" }}
      >
        <div className="text-5xl mb-4">⏳</div>
        <h1 className="text-white font-black text-2xl mb-2">Cuenta en revisión</h1>
        <p className="text-[#7ab88a] text-sm mb-4">
          Tu cuenta está pendiente de aprobación por el administrador.
          Recibirás acceso en breve.
        </p>
        <p className="text-[#4a7a5a] text-xs mb-6">
          ¿Ya deberías tener acceso? Recarga la página o contacta a quien te invitó.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => window.location.reload()}
            className="py-2 px-5 rounded-xl text-sm font-semibold border transition-colors text-[#7ab88a] border-[#2a5438] hover:border-[#F5C518]"
          >
            Recargar
          </button>
          <button
            onClick={signOut}
            className="py-2 px-5 rounded-xl text-sm font-bold text-black"
            style={{ background: "linear-gradient(135deg, #F5C518, #FFD700)" }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}
