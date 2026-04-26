"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase-browser"
import { useState } from "react"
import { useLanguage, useT } from "@/components/LangProvider"

interface NavbarProps {
  userEmail?: string | null
  isAdmin?: boolean
}

export default function Navbar({ userEmail, isAdmin }: NavbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const { lang, setLang } = useLanguage()
  const t = useT()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  const links = [
    { href: "/dashboard",  label: t("nav_dashboard"),  icon: "🏅" },
    { href: "/grupos",     label: t("nav_groups"),     icon: "⚽" },
    { href: "/tournament", label: t("nav_tournament"), icon: "🌍" },
    { href: "/help",       label: t("nav_help"),       icon: "❓" },
  ]
  if (isAdmin) links.push({ href: "/admin", label: t("nav_admin"), icon: "⚙️" })

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard"
    return pathname.startsWith(href)
  }

  function toggleLang() {
    setLang(lang === "es" ? "en" : "es")
  }

  return (
    <nav
      className="sticky top-0 z-50 border-b border-[#2a5438]"
      style={{ background: "rgba(10,18,8,0.96)", backdropFilter: "blur(12px)" }}
    >
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 font-black text-base flex-shrink-0">
          <span className="text-xl">🏆</span>
          <span className="gold-shimmer hidden sm:block text-sm">Quiniela 2026</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-0.5 flex-1 justify-center">
          {links.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                isActive(href)
                  ? "bg-[#F5C518]/10 text-[#F5C518]"
                  : "text-[#7ab88a] hover:text-white hover:bg-[#1a3322]"
              }`}
            >
              <span className="text-base leading-none">{icon}</span>
              <span>{label}</span>
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Language toggle */}
          <button
            onClick={toggleLang}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-colors"
            style={{
              borderColor: "#2a5438",
              color: "#7ab88a",
              background: "transparent",
            }}
            title={t("nav_change_lang")}
          >
            <span className="font-bold">{lang === "es" ? "ES" : "EN"}</span>
            <span className="hidden sm:inline opacity-60">{t("nav_change_lang")}</span>
          </button>

          {userEmail && (
            <span className="hidden lg:block text-[#4a7a5a] text-xs max-w-[140px] truncate">
              {userEmail}
            </span>
          )}
          <button
            onClick={handleSignOut}
            className="hidden md:flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-[#7ab88a] hover:text-red-400 hover:bg-red-400/10 transition-colors font-medium"
          >
            {t("nav_signout")}
          </button>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2 rounded-lg text-[#7ab88a] hover:bg-[#1a3322] transition-colors"
            aria-label="Menú"
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              }
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div
          className="md:hidden border-t border-[#2a5438] px-3 py-2 flex flex-col gap-0.5"
          style={{ background: "rgba(10,18,8,0.98)" }}
        >
          {links.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive(href)
                  ? "bg-[#F5C518]/10 text-[#F5C518]"
                  : "text-[#7ab88a] hover:text-white hover:bg-[#1a3322]"
              }`}
            >
              <span>{icon}</span>
              <span>{label}</span>
            </Link>
          ))}
          <div className="border-t border-[#1a3322] mt-1 pt-1">
            {userEmail && (
              <p className="px-3 py-1.5 text-xs text-[#4a7a5a] truncate">{userEmail}</p>
            )}
            <button
              onClick={toggleLang}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-[#7ab88a] hover:bg-[#1a3322] transition-colors"
            >
              <span>🌐</span>
              <span>{t("nav_lang_label")}: {lang === "es" ? "Español" : "English"}</span>
            </button>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-red-400 hover:bg-red-400/10 transition-colors"
            >
              <span>↩</span>
              <span>{t("nav_signout")}</span>
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
