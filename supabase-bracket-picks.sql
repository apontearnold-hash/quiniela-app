-- ================================================================
-- QUINIELA MUNDIAL 2026 — Bracket Picks + Cleanup
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query → Run
--
-- Qué hace:
--   1. Elimina fixtures manuales (IDs 1000001–1000104) y todos los
--      datos de prueba (quinielas, predictions, groups)
--   2. Crea la tabla bracket_picks para picks de eliminatoria
--      (desacoplada de fixture IDs — usa slot_key: "R32-01", etc.)
--
-- IMPORTANTE: Esto borra todos los datos de prueba.
-- Solo ejecutar antes de la apertura real de la quiniela.
-- ================================================================

-- ----------------------------------------------------------------
-- PARTE 1: Limpiar datos de prueba
-- ----------------------------------------------------------------

-- Limpiar predicciones (FK a quinielas)
DELETE FROM public.predictions;

-- Limpiar bracket_picks si ya existe la tabla
DELETE FROM public.bracket_picks WHERE true;

-- Limpiar quinielas
DELETE FROM public.quinielas;

-- Eliminar fixtures manuales (IDs creados en supabase-update.sql)
-- Los IDs de API-Football son números de 6-7 dígitos reales, no en este rango.
DELETE FROM public.fixtures
WHERE id BETWEEN 1000001 AND 1000104;

-- Limpiar standings (se recalculan de resultados reales)
DELETE FROM public.groups;

-- ----------------------------------------------------------------
-- PARTE 2: Crear tabla bracket_picks
-- Almacena picks de eliminatoria por slot_key lógico ("R32-01", etc.)
-- No tiene FK a fixtures → independiente de que el API publique partidos futuros
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.bracket_picks (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  quiniela_id         uuid        NOT NULL REFERENCES public.quinielas(id) ON DELETE CASCADE,
  slot_key            text        NOT NULL,   -- "R32-01", "R16-03", "QF-01", "SF-01", "3P", "FIN"
  home_score_pred     integer,
  away_score_pred     integer,
  predicts_penalties  boolean     DEFAULT false,
  penalties_winner    text        CHECK (penalties_winner IN ('home', 'away')),
  points_earned       integer     DEFAULT 0,  -- calculado por el pipeline de scoring
  created_at          timestamptz DEFAULT now() NOT NULL,
  updated_at          timestamptz DEFAULT now() NOT NULL,
  UNIQUE (quiniela_id, slot_key)
);

ALTER TABLE public.bracket_picks ENABLE ROW LEVEL SECURITY;

-- Solo el dueño de la quiniela puede ver/editar sus picks
DROP POLICY IF EXISTS "Dueño ve sus bracket picks"      ON public.bracket_picks;
DROP POLICY IF EXISTS "Dueño inserta sus bracket picks" ON public.bracket_picks;
DROP POLICY IF EXISTS "Dueño actualiza sus bracket picks" ON public.bracket_picks;
DROP POLICY IF EXISTS "service_role gestiona bracket picks" ON public.bracket_picks;

CREATE POLICY "Dueño ve sus bracket picks"
  ON public.bracket_picks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.quinielas q
      WHERE q.id = bracket_picks.quiniela_id
        AND q.user_id = auth.uid()
    )
  );

CREATE POLICY "Dueño inserta sus bracket picks"
  ON public.bracket_picks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.quinielas q
      WHERE q.id = bracket_picks.quiniela_id
        AND q.user_id = auth.uid()
    )
  );

CREATE POLICY "Dueño actualiza sus bracket picks"
  ON public.bracket_picks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.quinielas q
      WHERE q.id = bracket_picks.quiniela_id
        AND q.user_id = auth.uid()
    )
  );

CREATE POLICY "service_role gestiona bracket picks"
  ON public.bracket_picks FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_bracket_picks_quiniela
  ON public.bracket_picks(quiniela_id);

-- ================================================================
-- FIN
-- Después de ejecutar:
--   1. Verifica que fixtures solo tenga IDs de API-Football (> 1000104)
--      SELECT COUNT(*), MIN(id), MAX(id) FROM fixtures;
--   2. Verifica que bracket_picks existe vacía
--      SELECT COUNT(*) FROM bracket_picks;
--   3. Crea una quiniela de prueba en /quiniela/new y revisa que
--      el editor muestre grupos reales + bracket de slots
-- ================================================================
