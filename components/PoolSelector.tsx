"use client"

import { useRouter } from "next/navigation"

export default function PoolSelector({
  pools,
  currentPoolId,
}: {
  pools: { id: string; name: string }[]
  currentPoolId: string
}) {
  const router = useRouter()

  if (pools.length <= 1) return null

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newPoolId = e.target.value
    document.cookie = `selected_pool=${newPoolId}; path=/; max-age=31536000; SameSite=Lax`
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[#7ab88a] text-xs font-semibold uppercase tracking-wider">Liga:</span>
      <select
        value={currentPoolId}
        onChange={handleChange}
        className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-[#F5C518] cursor-pointer"
        style={{ background: "#1a3322", border: "1px solid #2a5438" }}
      >
        {pools.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </div>
  )
}
