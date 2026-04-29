-- Add lock_date to tournament_config
-- Run once in Supabase SQL editor.
-- lock_date: if set, overrides the dynamic first-kickoff calculation for quiniela locks.

ALTER TABLE public.tournament_config
  ADD COLUMN IF NOT EXISTS lock_date timestamptz DEFAULT NULL;
