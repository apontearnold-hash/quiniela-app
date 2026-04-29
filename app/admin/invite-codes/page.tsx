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
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "Arial, Helvetica, sans-serif" }}>
      <Navbar userEmail={user.email} isAdmin={isAdmin} />
      <div style={{ maxWidth: "896px", margin: "0 auto", padding: "32px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px" }}>
          <Link href="/admin?tab=ligas" style={{ color: "#2563eb", fontSize: "14px", textDecoration: "none", fontWeight: 500 }}>← Admin</Link>
          <h1 style={{ fontSize: "22px", fontWeight: 900, color: "#0f172a", margin: 0 }}>Códigos de Invitación</h1>
        </div>
        <InviteCodesPanel codes={codes ?? []} pools={pools ?? []} />
      </div>
    </div>
  )
}
