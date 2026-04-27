"use client"

import Link from "next/link"
import CountdownTimer from "@/components/CountdownTimer"
import { useLanguage } from "@/components/LangProvider"

// ── Bilingual copy ────────────────────────────────────────────────────────────

const COPY = {
  es: {
    eyebrow:       "Quiniela",
    title:         "Mundial 2026",
    location:      "USA · México · Canadá",
    disclaimer:    "Juego no oficial de predicciones",
    countdownLbl:  "El torneo comienza en",
    cta:           "Jugar ahora",
    footer:        "Quiniela Mundial 2026 · No oficial · Solo entretenimiento",
    features: [
      { icon: "🔒", title: "Ligas privadas",          desc: "Crea o únete a ligas con tus amigos usando códigos de invitación." },
      { icon: "⚡", title: "Actualización automática", desc: "Resultados y puntos actualizados automáticamente tras cada partido." },
      { icon: "🌐", title: "Información completa",     desc: "Equipos, grupos y eliminatorias en un solo lugar." },
      { icon: "📊", title: "Ranking en vivo",          desc: "Tabla de posiciones actualizada en tiempo real." },
    ],
  },
  en: {
    eyebrow:       "Prediction Game",
    title:         "World Cup 2026",
    location:      "USA · Mexico · Canada",
    disclaimer:    "Unofficial prediction game",
    countdownLbl:  "Tournament starts in",
    cta:           "Play now",
    footer:        "Quiniela Mundial 2026 · Unofficial · For entertainment only",
    features: [
      { icon: "🔒", title: "Private leagues",   desc: "Create or join leagues with your friends using invite codes." },
      { icon: "⚡", title: "Auto-updated",       desc: "Results and points updated automatically after each match." },
      { icon: "🌐", title: "Full information",   desc: "Teams, groups and knockout stages in one place." },
      { icon: "📊", title: "Live rankings",      desc: "Standings updated in real time." },
    ],
  },
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LandingContent() {
  const { lang, setLang } = useLanguage()
  const c = COPY[lang] ?? COPY.es

  return (
    <main style={{
      minHeight: "100vh",
      background: "#f8fafc",
      fontFamily: "Arial, Helvetica, sans-serif",
      display: "flex",
      flexDirection: "column",
    }}>

      {/* ── Top bar ── */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", padding: "16px 24px" }}>
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
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ color: "#2563eb" }}>{lang === "es" ? "EN" : "ES"}</span>
          <span style={{ color: "#94a3b8", fontSize: "11px" }}>·</span>
          <span>{lang === "es" ? "Cambiar idioma" : "Change language"}</span>
        </button>
      </div>

      {/* ── Hero ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 24px 64px" }}>

        {/* Emblem + title row — responsive via flex-wrap */}
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: "32px",
          maxWidth: "760px",
          width: "100%",
          marginBottom: "36px",
        }}>

          {/* Emblem */}
          <div style={{ flexShrink: 0 }}>
            <img
              src="/wc2026-emblem.svg"
              alt="FIFA World Cup 2026"
              style={{ width: "160px", height: "auto", display: "block" }}
            />
          </div>

          {/* Title block */}
          <div style={{ flex: "1 1 260px", textAlign: "center" }}>
            <p style={{
              fontSize: "12px", fontWeight: 700,
              letterSpacing: "0.12em", textTransform: "uppercase",
              color: "#64748b", margin: "0 0 8px",
            }}>
              {c.eyebrow}
            </p>
            <h1 style={{
              fontSize: "clamp(38px, 8vw, 68px)",
              fontWeight: 900,
              color: "#0f172a",
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
              margin: "0 0 8px",
            }}>
              {c.title}
            </h1>
            <p style={{
              fontSize: "clamp(14px, 2.5vw, 17px)",
              color: "#334155",
              margin: "0 0 5px",
              fontWeight: 500,
              letterSpacing: "0.04em",
            }}>
              {c.location}
            </p>
            <p style={{
              fontSize: "12px",
              color: "#64748b",
              margin: 0,
              fontWeight: 400,
            }}>
              {c.disclaimer}
            </p>
          </div>

        </div>

        {/* Countdown */}
        <div style={{ marginBottom: "40px", width: "100%" }}>
          <p style={{
            fontSize: "11px", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.1em",
            color: "#64748b", margin: "0 0 14px", textAlign: "center",
          }}>
            {c.countdownLbl}
          </p>
          <CountdownTimer targetDate="2026-06-11T20:00:00Z" />
        </div>

        {/* CTA */}
        <Link
          href="/login"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "14px 40px",
            borderRadius: "12px",
            background: "#2563eb",
            color: "white",
            fontWeight: 700,
            fontSize: "16px",
            textDecoration: "none",
            letterSpacing: "0.01em",
            boxShadow: "0 4px 16px rgba(37,99,235,0.25)",
          }}
        >
          {c.cta}
          <span style={{ fontSize: "18px", lineHeight: 1 }}>→</span>
        </Link>

      </div>

      {/* ── Feature cards ── */}
      <div style={{ maxWidth: "960px", width: "100%", margin: "0 auto", padding: "0 20px 72px" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "16px",
        }}>
          {c.features.map(f => (
            <div
              key={f.title}
              style={{
                background: "white",
                border: "1px solid #e2e8f0",
                borderRadius: "16px",
                padding: "22px 20px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              }}
            >
              <span style={{ fontSize: "22px", display: "block", marginBottom: "10px" }}>{f.icon}</span>
              <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", margin: "0 0 5px" }}>{f.title}</h3>
              <p style={{ fontSize: "13px", color: "#334155", margin: 0, lineHeight: 1.55 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ textAlign: "center", padding: "0 0 28px", color: "#94a3b8", fontSize: "11px", letterSpacing: "0.03em" }}>
        {c.footer}
      </div>

    </main>
  )
}
