-- RLS Policies for quiniela privacy rules
-- Run in Supabase SQL Editor AFTER reviewing carefully.
--
-- Rules:
--   pool_members:  you can read only your own membership rows
--   quinielas:     draft = owner only; submitted = pool members can read
--   predictions:   write = owner only; read = same as quiniela rule
--   bracket_picks: write = owner only; read = same as quiniela rule
--
-- All server routes use createAdminClient() (service_role) which bypasses RLS.
-- These policies are a defense layer for any direct client-SDK access.

-- ── Enable RLS ────────────────────────────────────────────────────────────────
ALTER TABLE public.pool_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quinielas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bracket_picks   ENABLE ROW LEVEL SECURITY;

-- ── pool_members ──────────────────────────────────────────────────────────────
-- Non-recursive: you can only read your own membership rows.
-- The quinielas policies that JOIN pool_members filter on pm.user_id = auth.uid(),
-- which is consistent with this policy — no recursion possible.

DROP POLICY IF EXISTS "pool_members_select_own" ON public.pool_members;
CREATE POLICY "pool_members_select_own" ON public.pool_members
  FOR SELECT USING (user_id = auth.uid());

-- ── quinielas ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "quinielas_owner_all"         ON public.quinielas;
DROP POLICY IF EXISTS "quinielas_pool_member_read"  ON public.quinielas;

-- Owner: full access
CREATE POLICY "quinielas_owner_all" ON public.quinielas
  FOR ALL USING (auth.uid() = user_id);

-- Pool members: read submitted quinielas in their pool
CREATE POLICY "quinielas_pool_member_read" ON public.quinielas
  FOR SELECT USING (
    status = 'submitted'
    AND EXISTS (
      SELECT 1 FROM public.pool_members pm
      WHERE pm.pool_id = quinielas.pool_id
        AND pm.user_id = auth.uid()
    )
  );

-- ── predictions ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "predictions_owner_all"        ON public.predictions;
DROP POLICY IF EXISTS "predictions_pool_member_read" ON public.predictions;

-- Owner: full access
CREATE POLICY "predictions_owner_all" ON public.predictions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.quinielas q
      WHERE q.id = predictions.quiniela_id
        AND q.user_id = auth.uid()
    )
  );

-- Pool members: read predictions of submitted quinielas in their pool
CREATE POLICY "predictions_pool_member_read" ON public.predictions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.quinielas q
      JOIN public.pool_members pm
        ON pm.pool_id = q.pool_id AND pm.user_id = auth.uid()
      WHERE q.id = predictions.quiniela_id
        AND q.status = 'submitted'
    )
  );

-- ── bracket_picks ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "bracket_picks_owner_all"        ON public.bracket_picks;
DROP POLICY IF EXISTS "bracket_picks_pool_member_read" ON public.bracket_picks;

-- Owner: full access
CREATE POLICY "bracket_picks_owner_all" ON public.bracket_picks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.quinielas q
      WHERE q.id = bracket_picks.quiniela_id
        AND q.user_id = auth.uid()
    )
  );

-- Pool members: read bracket picks of submitted quinielas in their pool
CREATE POLICY "bracket_picks_pool_member_read" ON public.bracket_picks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.quinielas q
      JOIN public.pool_members pm
        ON pm.pool_id = q.pool_id AND pm.user_id = auth.uid()
      WHERE q.id = bracket_picks.quiniela_id
        AND q.status = 'submitted'
    )
  );
