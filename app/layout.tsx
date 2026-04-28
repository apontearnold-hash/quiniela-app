import type { Metadata } from "next"
import "./globals.css"
import { LangProvider } from "@/components/LangProvider"
import { cookies } from "next/headers"
import type { Lang } from "@/lib/i18n"

export const metadata: Metadata = {
  title: "Quiniela Mundial 2026",
  description: "La mejor quiniela del Mundial de Fútbol 2026",
  icons: { icon: "/favicon.ico" },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const defaultLang: Lang = cookieStore.get("lang")?.value === "en" ? "en" : "es"

  return (
    <html lang={defaultLang} className="h-full">
      <body className="min-h-full flex flex-col">
        <LangProvider defaultLang={defaultLang}>{children}</LangProvider>
      </body>
    </html>
  )
}
