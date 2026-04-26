"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getT, type Lang, type TKey } from "@/lib/i18n"

interface LangCtx {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: TKey) => string
}

const Ctx = createContext<LangCtx>({
  lang: "es",
  setLang: () => {},
  t: (k) => k,
})

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("es")
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem("lang") as Lang | null
    if (stored === "es" || stored === "en") setLangState(stored)
  }, [])

  function setLang(l: Lang) {
    setLangState(l)
    localStorage.setItem("lang", l)
    document.cookie = `lang=${l};path=/;max-age=31536000;samesite=lax`
    router.refresh()
  }

  return (
    <Ctx.Provider value={{ lang, setLang, t: getT(lang) }}>
      {children}
    </Ctx.Provider>
  )
}

export function useLanguage() {
  return useContext(Ctx)
}

export function useT() {
  return useContext(Ctx).t
}
