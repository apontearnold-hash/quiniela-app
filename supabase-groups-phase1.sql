-- ================================================================
-- QUINIELA MUNDIAL 2026 — Phase 1: Multi-Group Foundation
-- Run in Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to run multiple times (uses IF NOT EXISTS / ON CONFLICT)
-- ================================================================
--
-- NAMING NOTE:
--   The existing table "public.groups" stores World Cup group standings
--   (Grupo A, Grupo B, etc. — the 48 teams). It must not be renamed.
--   The new "quiniela pools" (groups of competing players) are stored
--   in "public.pools" to avoid this collision.
--   The UI will still call them "Grupos de Quiniela" for users.
-- ================================================================


-- ----------------------------------------------------------------
-- 1. POOLS TABLE — quiniela groups (competing pools of players)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pools (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  description         text,
  price_per_quiniela  numeric(10,2) NOT NULL DEFAULT 5.00,
  currency            text NOT NULL DEFAULT 'USD',
  created_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios autenticados ven pools activos" ON public.pools;
CREATE POLICY "Usuarios autenticados ven pools activos"
  ON public.pools FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "service_role gestiona pools" ON public.pools;
CREATE POLICY "service_role gestiona pools"
  ON public.pools FOR ALL
  USING (auth.role() = 'service_role');


-- ----------------------------------------------------------------
-- 2. POOL_MEMBERS TABLE — users ↔ pools membership
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pool_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id    uuid NOT NULL REFERENCES public.pools(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pool_id, user_id)
);

ALTER TABLE public.pool_members ENABLE ROW LEVEL SECURITY;

-- Members can see other members of pools they belong to
DROP POLICY IF EXISTS "Miembros ven su pool" ON public.pool_members;
CREATE POLICY "Miembros ven su pool"
  ON public.pool_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.pool_members pm
      WHERE pm.pool_id = pool_members.pool_id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "service_role gestiona membresías" ON public.pool_members;
CREATE POLICY "service_role gestiona membresías"
  ON public.pool_members FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_pool_members_pool ON public.pool_members(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_members_user ON public.pool_members(user_id);


-- ----------------------------------------------------------------
-- 3. EXTEND INVITE_CODES — link each code to a pool
-- ----------------------------------------------------------------
ALTER TABLE public.invite_codes
  ADD COLUMN IF NOT EXISTS pool_id uuid REFERENCES public.pools(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invite_codes_pool ON public.invite_codes(pool_id);


-- ----------------------------------------------------------------
-- 4. EXTEND QUINIELAS — link each quiniela to a pool
-- ----------------------------------------------------------------
ALTER TABLE public.quinielas
  ADD COLUMN IF NOT EXISTS pool_id uuid REFERENCES public.pools(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quinielas_pool ON public.quinielas(pool_id);


-- ----------------------------------------------------------------
-- 5. DEFAULT LEGACY POOL — preserves all existing data
--    Uses a fixed UUID so this is idempotent on re-runs.
-- ----------------------------------------------------------------
INSERT INTO public.pools (id, name, description, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'General',
  'Grupo principal — participantes originales antes del sistema de grupos',
  true
)
ON CONFLICT (id) DO NOTHING;

-- Copy current global price into the legacy pool
UPDATE public.pools
SET
  price_per_quiniela = COALESCE(
    (SELECT quiniela_price FROM public.tournament_config WHERE id = 1),
    5.00
  ),
  currency = COALESCE(
    (SELECT currency FROM public.tournament_config WHERE id = 1),
    'USD'
  )
WHERE id = '00000000-0000-0000-0000-000000000001';


-- ----------------------------------------------------------------
-- 6. MIGRATE EXISTING DATA INTO LEGACY POOL
-- ----------------------------------------------------------------

-- All existing users → legacy pool as members
INSERT INTO public.pool_members (pool_id, user_id, role, joined_at)
SELECT
  '00000000-0000-0000-0000-000000000001',
  id,
  'member',
  created_at
FROM public.profiles
ON CONFLICT (pool_id, user_id) DO NOTHING;

-- All existing invite codes → legacy pool
UPDATE public.invite_codes
SET pool_id = '00000000-0000-0000-0000-000000000001'
WHERE pool_id IS NULL;

-- All existing quinielas → legacy pool
UPDATE public.quinielas
SET pool_id = '00000000-0000-0000-0000-000000000001'
WHERE pool_id IS NULL;


-- ================================================================
-- VERIFICATION — run these SELECT statements to confirm
-- ================================================================

-- SELECT count(*) AS pools FROM public.pools;
-- SELECT count(*) AS pool_members FROM public.pool_members;
-- SELECT count(*) AS invite_codes_linked FROM public.invite_codes WHERE pool_id IS NOT NULL;
-- SELECT count(*) AS quinielas_linked FROM public.quinielas WHERE pool_id IS NOT NULL;
