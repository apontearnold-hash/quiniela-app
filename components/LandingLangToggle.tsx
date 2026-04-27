"use client"

// This component is kept for potential reuse.
// The landing page uses the toggle inline inside LandingContent.tsx.

import { useLanguage } from "@/components/LangProvider"

export default function LandingLangToggle() {
  const { lang, setLang } = useLanguage()
  return (
    <button
      onClick={() => setLang(lang === "es" ? "en" : "es")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "7px 16px",
        borderRadius: "999px",
        border: "1.5px solid #cbd5e1",
        background: "white",
        color: "#334155",
        fontSize: "13px",
        fontWeight: 700,
        cursor: "pointer",
        letterSpacing: "0.03em",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}
    >
      <span style={{ color: "#2563eb" }}>{lang === "es" ? "EN" : "ES"}</span>
      <span style={{ color: "#94a3b8", fontSize: "11px" }}>·</span>
      <span>{lang === "es" ? "Cambiar idioma" : "Change language"}</span>
    </button>
  )
}
