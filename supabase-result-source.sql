-- ================================================================
-- supabase-result-source.sql
-- Adds result_source column to fixtures table.
-- Required for the safe tournament simulation feature.
--
-- SAFE TO RUN multiple times (uses IF NOT EXISTS).
-- ================================================================

ALTER TABLE public.fixtures
  ADD COLUMN IF NOT EXISTS result_source text
  CHECK (result_source IN ('api', 'manual', 'simulation'));

-- Backfill: mark any already-finished fixtures as 'api' source
-- (only if result_source is currently null and scores are present)
UPDATE public.fixtures
SET result_source = 'api'
WHERE result_source IS NULL
  AND status = 'finished'
  AND home_score IS NOT NULL
  AND away_score IS NOT NULL;
