"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase-browser"
import { useT } from "@/components/LangProvider"

interface Props {
  show: boolean
  userId: string
}

export default function OnboardingModal({ show, userId }: Props) {
  const [visible, setVisible] = useState(show)
  const router = useRouter()
  const t = useT()

  if (!visible) return null

  const SECTIONS = [
    { icon: "⚽", title: t("onboarding_s1_title"), text: t("onboarding_s1_text") },
    { icon: "💾", title: t("onboarding_s2_title"), text: t("onboarding_s2_text") },
    { icon: "👥", title: t("onboarding_s3_title"), text: t("onboarding_s3_text") },
    { icon: "🌍", title: t("onboarding_s4_title"), text: t("onboarding_s4_text") },
    { icon: "📖", title: t("onboarding_s5_title"), text: t("onboarding_s5_text") },
  ]

  function markSeen() {
    setVisible(false)
    // Supabase query builder is lazy — must call .then() to actually execute it
    createClient()
      .from("profiles")
      .update({ onboarding_seen: true })
      .eq("id", userId)
      .then(({ error }) => {
        if (error) console.error("[onboarding] failed to mark seen:", error.message)
      })
  }

  function goCreate() {
    markSeen()
    router.push("/quiniela/new")
  }

  function goHelp() {
    markSeen()
    router.push("/help")
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)" }}
    >
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl"
        style={{ background: "white" }}
      >
        {/* Close button */}
        <button
          onClick={markSeen}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl leading-none"
          aria-label={t("close_label")}
        >
          ×
        </button>

        <div className="p-6 pb-0">
          {/* Header */}
          <div className="mb-4">
            <div className="text-3xl mb-2">🏆</div>
            <h2 className="text-xl font-black" style={{ color: "#111827" }}>
              {t("onboarding_title")}
            </h2>
            <p className="text-sm mt-2" style={{ color: "#6b7280" }}>
              {t("onboarding_subtitle")}
            </p>
          </div>

          {/* Sections */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
            {SECTIONS.map(s => (
              <div
                key={s.title}
                className="flex gap-3 rounded-xl p-3"
                style={{ background: "#f9fafb", border: "1px solid #e5e7eb" }}
              >
                <span className="text-xl flex-shrink-0">{s.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-bold" style={{ color: "#111827" }}>{s.title}</p>
                  <p className="text-xs mt-0.5 leading-snug" style={{ color: "#6b7280" }}>{s.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div
          className="sticky bottom-0 flex flex-col sm:flex-row gap-2 p-4 pt-3"
          style={{ background: "white", borderTop: "1px solid #e5e7eb" }}
        >
          <button
            onClick={goCreate}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition-opacity"
            style={{ background: "#F5C518", color: "#1a1a00" }}
          >
            {t("onboarding_btn_create")}
          </button>
          <button
            onClick={goHelp}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition-opacity"
            style={{ background: "#f3f4f6", color: "#111827" }}
          >
            {t("onboarding_btn_help")}
          </button>
          <button
            onClick={markSeen}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium hover:opacity-80 transition-opacity"
            style={{ color: "#9ca3af" }}
          >
            {t("onboarding_btn_dismiss")}
          </button>
        </div>
      </div>
    </div>
  )
}
