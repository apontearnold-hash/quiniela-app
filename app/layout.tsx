import type { Metadata } from "next"
import "./globals.css"
import { LangProvider } from "@/components/LangProvider"

export const metadata: Metadata = {
  title: "Quiniela Mundial 2026",
  description: "La mejor quiniela del Mundial de Fútbol 2026",
  icons: { icon: "/favicon.ico" },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-full flex flex-col">
        <LangProvider>{children}</LangProvider>
      </body>
    </html>
  )
}
