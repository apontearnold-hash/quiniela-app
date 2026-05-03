-- ── Fix: infinite recursion in pool_members RLS ──────────────────────────────
--
-- Root cause: pool_members had a policy that re-queried pool_members to check
-- "am I in the same pool?" — e.g.:
--
--   USING (EXISTS (SELECT 1 FROM pool_members pm2
--                  WHERE pm2.pool_id = pool_members.pool_id
--                    AND pm2.user_id = auth.uid()))
--
-- Evaluating that policy requires scanning pool_members, which triggers the
-- same policy again → infinite recursion.
--
-- The recursion is also triggered indirectly:
--   predictions_owner_all  →  quinielas (has RLS)
--   quinielas_pool_member_read  →  pool_members (has recursive RLS)
--   → boom.
--
-- Fix: replace ALL pool_members policies with a single non-recursive rule:
--   "you can read only your own membership row(s)".
--
-- This is safe because:
--   • All server routes use createAdminClient() (service_role), which bypasses
--     RLS entirely — no server path needs cross-member visibility.
--   • The only client-side pool_members query is the view-page membership
--     check: .eq("pool_id", ...).eq("user_id", user.id) — returns own row only.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Ensure RLS is on (no-op if already enabled)
ALTER TABLE public.pool_members ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop every policy on pool_members, whatever it may be named.
-- We list the most likely names; unknown policies are caught by the DO block.
DROP POLICY IF EXISTS "pool_members_same_pool_read"              ON public.pool_members;
DROP POLICY IF EXISTS "pool_members_select_own"                  ON public.pool_members;
DROP POLICY IF EXISTS "pool_members_read_own"                    ON public.pool_members;
DROP POLICY IF EXISTS "pool_members_insert_own"                  ON public.pool_members;
DROP POLICY IF EXISTS "pool_members_delete_own"                  ON public.pool_members;
DROP POLICY IF EXISTS "Enable read access for all users"         ON public.pool_members;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.pool_members;
DROP POLICY IF EXISTS "pool_members_owner_all"                   ON public.pool_members;
DROP POLICY IF EXISTS "pool_members_all"                         ON public.pool_members;

-- Safety net: drop any remaining policies not covered above
DO $$
DECLARE
  pol text;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'pool_members'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.pool_members', pol);
  END LOOP;
END $$;

-- Step 3: Single non-recursive policy.
-- "SELECT your own rows" — never references pool_members again.
CREATE POLICY "pool_members_select_own" ON public.pool_members
  FOR SELECT USING (user_id = auth.uid());

-- No INSERT / UPDATE / DELETE policies are created.
-- Users join/leave pools only through server API routes that use service_role,
-- so client-side writes to this table are intentionally blocked.
