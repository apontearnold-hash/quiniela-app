-- Add api_fixture_id to track real API fixture IDs on synthetic knockout slots.
-- For group-stage fixtures the id IS the API fixture id, so we backfill it.
-- For synthetic slots (id >= 9000000) it starts NULL and is set by sync when
-- API-Football publishes the real match.

ALTER TABLE public.fixtures
  ADD COLUMN IF NOT EXISTS api_fixture_id INTEGER DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_fixtures_api_fixture_id
  ON public.fixtures (api_fixture_id)
  WHERE api_fixture_id IS NOT NULL;

-- Backfill: group-stage and any real API fixtures already use the API ID as PK
UPDATE public.fixtures
  SET api_fixture_id = id
  WHERE id < 9000000
    AND api_fixture_id IS NULL;
