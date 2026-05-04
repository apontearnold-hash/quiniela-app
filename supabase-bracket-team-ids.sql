-- Migration: add team prediction columns to bracket_picks
-- Run once in Supabase SQL editor.
-- Safe to run multiple times (IF NOT EXISTS).

ALTER TABLE public.bracket_picks
  ADD COLUMN IF NOT EXISTS home_team_id_pred   INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS away_team_id_pred   INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS home_team_name_pred TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS away_team_name_pred TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS home_team_flag_pred TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS away_team_flag_pred TEXT    DEFAULT NULL;
