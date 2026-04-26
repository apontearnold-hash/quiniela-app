import { createClient, createAdminClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import Navbar from "@/components/Navbar"
import InviteCodesPanel from "@/components/InviteCodesPanel"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function AdminInviteCodesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const isAdmin = user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL
  if (!isAdmin) redirect("/dashboard")

  const admin = createAdminClient()

  const { data: codes } = await admin
    .from("invite_codes")
    .select("*, pools(id, name)")
    .order("created_at", { ascending: false })

  const { data: pools } = await admin
    .from("pools")
    .select("id, name")
    .eq("is_active", true)
    .order("created_at", { ascending: true })

  return (
    <div className="min-h-screen" style={{ background: "#0a1208" }}>
      <Navbar userEmail={user.email} isAdmin={isAdmin} />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin" className="text-[#7ab88a] text-sm hover:text-white">← Admin</Link>
          <h1 className="text-2xl font-black text-white">Códigos de Invitación</h1>
        </div>
        <InviteCodesPanel codes={codes ?? []} pools={pools ?? []} />
      </div>
    </div>
  )
}
