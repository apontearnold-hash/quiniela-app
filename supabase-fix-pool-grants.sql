-- ================================================================
-- QUINIELA MUNDIAL 2026 — Fix pool table grants
-- Run in Supabase Dashboard → SQL Editor → New Query → Run
--
-- Problem: pools and pool_members were created with RLS enabled but
-- no GRANT statements. Without explicit grants, PostgreSQL silently
-- returns 0 rows to authenticated users even when RLS policies pass.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. GRANT SELECT on pools and pool_members to authenticated role
--    (Required for the anon/ssr supabase client to read these tables)
-- ----------------------------------------------------------------
GRANT SELECT ON public.pools        TO authenticated;
GRANT SELECT ON public.pool_members TO authenticated;

-- ----------------------------------------------------------------
-- 2. SIMPLIFY pool_members RLS policy
--    The original policy has a recursive EXISTS subquery which can
--    cause performance issues. Replace with a direct user_id check.
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Miembros ven su pool" ON public.pool_members;
CREATE POLICY "Miembros ven su pool"
  ON public.pool_members FOR SELECT
  USING (user_id = auth.uid());

-- ----------------------------------------------------------------
-- 3. Verify — after running, these should return correct counts:
-- ----------------------------------------------------------------
-- SELECT count(*) FROM public.pool_members WHERE user_id = auth.uid();
-- SELECT pm.pool_id, p.name FROM public.pool_members pm JOIN public.pools p ON p.id = pm.pool_id WHERE pm.user_id = auth.uid();
