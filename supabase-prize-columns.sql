-- Add prize type and per-place prize columns to pools table
ALTER TABLE public.pools
  ADD COLUMN IF NOT EXISTS prize_type text NOT NULL DEFAULT 'money' CHECK (prize_type IN ('money', 'physical')),
  ADD COLUMN IF NOT EXISTS prize_description text,
  ADD COLUMN IF NOT EXISTS prize_1st text,
  ADD COLUMN IF NOT EXISTS prize_2nd text,
  ADD COLUMN IF NOT EXISTS prize_3rd text;
