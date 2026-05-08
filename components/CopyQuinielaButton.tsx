"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useT } from "@/components/LangProvider"

interface Props {
  quinielaId: string
  quinielaName: string
  currentPoolId: string | null
  userPools: { id: string; name: string }[]
}

export default function CopyQuinielaButton({
  quinielaId,
  quinielaName,
  currentPoolId,
  userPools,
}: Props) {
  const t = useT()
  const router = useRouter()

  const [open, setOpen]           = useState(false)
  const [copyName, setCopyName]   = useState("")
  const [copyPoolId, setCopyPoolId] = useState("")
  const [copying, setCopying]     = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)

  function openModal() {
    setCopyName(quinielaName + t("copy_name_suffix"))
    setCopyPoolId(currentPoolId ?? userPools[0]?.id ?? "")
    setCopyError(null)
    setOpen(true)
  }

  async function confirmCopy() {
    setCopying(true)
    setCopyError(null)
    try {
      const res = await fetch(`/api/quiniela/${quinielaId}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: copyName.trim(), pool_id: copyPoolId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCopyError(
          data.error === "duplicate_name"
            ? t("copy_duplicate_name")
            : (data.error ?? t("err_copy"))
        )
        return
      }
      setOpen(false)
      router.push(`/quiniela/${data.id}/edit`)
    } finally {
      setCopying(false)
    }
  }

  return (
    <>
      <button
        onClick={openModal}
        className="flex items-center gap-1.5 py-2.5 px-4 rounded-xl font-bold text-sm flex-shrink-0 transition-colors"
        style={{ background: "#e0f2fe", color: "#0369a1", border: "1px solid #7dd3fc" }}
      >
        📋 {t("copy_btn")}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.6)" }}
        >
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h2 className="font-black text-gray-900 text-base mb-1">{t("copy_title")}</h2>
            <p className="text-sm text-gray-500 mb-1">{t("copy_modal_desc")}</p>
            <p className="text-xs text-gray-400 mb-4">
              {t("copy_source_label")} <strong>{quinielaName}</strong>
            </p>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  {t("copy_name_label")}
                </label>
                <input
                  type="text"
                  value={copyName}
                  onChange={e => { setCopyName(e.target.value); setCopyError(null) }}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  disabled={copying}
                  autoFocus
                />
              </div>

              {userPools.length > 1 && (
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    {t("copy_pool_label")}
                  </label>
                  <select
                    value={copyPoolId}
                    onChange={e => { setCopyPoolId(e.target.value); setCopyError(null) }}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    disabled={copying}
                  >
                    {userPools.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {copyError && (
                <p className="text-xs text-red-600 font-semibold">{copyError}</p>
              )}

              <div className="flex gap-3 justify-end mt-2">
                <button
                  onClick={() => setOpen(false)}
                  disabled={copying}
                  className="px-4 py-2 rounded-xl text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {t("cancel")}
                </button>
                <button
                  onClick={confirmCopy}
                  disabled={copying || !copyName.trim()}
                  className="px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50"
                  style={{ background: "#F5C518", color: "#1a1a00" }}
                >
                  {copying ? t("copy_copying") : t("copy_confirm_btn")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
