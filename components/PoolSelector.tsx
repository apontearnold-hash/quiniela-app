"use client"

import { useRouter } from "next/navigation"
import { useT } from "@/components/LangProvider"

export default function PoolSelector({
  pools,
  currentPoolId,
}: {
  pools: { id: string; name: string }[]
  currentPoolId: string
}) {
  const router = useRouter()
  const t = useT()

  if (pools.length <= 1) return null

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    document.cookie = `selected_pool=${e.target.value}; path=/; max-age=31536000; SameSite=Lax`
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-500 text-xs font-semibold uppercase tracking-wider">{t("pool_label")}:</span>
      <select
        value={currentPoolId}
        onChange={handleChange}
        className="px-3 py-1.5 rounded-lg text-sm font-semibold text-gray-900 bg-white border border-gray-200 focus:outline-none focus:ring-2 focus:ring-yellow-400 cursor-pointer"
      >
        {pools.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </div>
  )
}
