import LoginForm from "@/components/LoginForm"
import Link from "next/link"

export default function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center grass-bg relative px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a4d1c]/50 to-[#0a1208] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="text-4xl inline-block mb-3">🏆</Link>
          <h1 className="text-2xl font-black uppercase tracking-wide">
            <span className="gold-shimmer">Quiniela Mundial 2026</span>
          </h1>
          <p className="text-[#7ab88a] text-sm mt-1">Inicia sesión para participar</p>
        </div>

        {/* Login Card */}
        <div
          className="rounded-2xl p-8"
          style={{ background: 'linear-gradient(135deg, #152a1a, #1a3322)', border: '1px solid #2a5438' }}
        >
          <LoginForm />
        </div>
      </div>
    </main>
  )
}
