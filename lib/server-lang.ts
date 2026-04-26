import { cookies } from "next/headers"
import { getT, type Lang } from "@/lib/i18n"

export async function getServerT() {
  const store = await cookies()
  const lang = (store.get("lang")?.value ?? "es") as Lang
  return getT(lang === "en" ? "en" : "es")
}
