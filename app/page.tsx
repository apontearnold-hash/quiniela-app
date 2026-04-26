import Link from "next/link"
import CountdownTimer from "@/components/CountdownTimer"
import { createClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"

export default async function LandingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) redirect("/dashboard")

  return (
    <main className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden grass-bg">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a4d1c] via-[#0a1208] to-[#0a1208] pointer-events-none" />
      {/* Decorative circles */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-[#2a5438]/30 pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full border border-[#2a5438]/20 pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center px-4 py-12 text-center max-w-3xl mx-auto">
        <div className="text-7xl mb-4 trophy-anim select-none">🏆</div>

        <h1 className="text-4xl sm:text-6xl font-black uppercase tracking-tight mb-2">
          <span className="gold-shimmer">Quiniela</span>
        </h1>
        <h2 className="text-2xl sm:text-4xl font-bold text-white mb-1 uppercase tracking-wider">
          Mundial 2026
        </h2>
        <p className="text-[#7ab88a] text-sm sm:text-base mb-10 uppercase tracking-widest font-medium">
          USA · México · Canadá
        </p>

        <div className="w-full mb-12">
          <p className="text-[#7ab88a] text-sm uppercase tracking-widest mb-6 font-medium">
            El torneo comienza en
          </p>
          <CountdownTimer targetDate="2026-06-11T20:00:00Z" />
        </div>

        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm">
          <Link
            href="/login"
            className="flex-1 py-4 px-8 rounded-xl font-bold text-lg text-black uppercase tracking-wide transition-all duration-200 hover:scale-105 hover:shadow-[0_0_30px_rgba(245,197,24,0.4)]"
            style={{ background: 'linear-gradient(135deg, #F5C518, #FFD700)' }}
          >
            Jugar Ahora
          </Link>
          <Link
            href="/dashboard"
            className="flex-1 py-4 px-8 rounded-xl font-bold text-lg border-2 border-[#F5C518] text-[#F5C518] uppercase tracking-wide transition-all duration-200 hover:bg-[#F5C518]/10"
          >
            Ver Ranking
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-4 w-full max-w-2xl">
          {[
            { icon: "⚽", label: "104 Partidos" },
            { icon: "🎯", label: "Sistema de Puntos" },
            { icon: "📱", label: "100% Mobile" },
            { icon: "🏅", label: "Ranking Global" },
          ].map((f) => (
            <div
              key={f.label}
              className="flex flex-col items-center gap-2 p-4 rounded-xl"
              style={{ background: 'rgba(26,51,34,0.8)', border: '1px solid #2a5438' }}
            >
              <span className="text-2xl">{f.icon}</span>
              <span className="text-xs text-[#7ab88a] font-medium text-center">{f.label}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
