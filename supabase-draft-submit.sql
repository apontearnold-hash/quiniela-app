-- =================================================================
-- supabase-draft-submit.sql
-- Adds draft/submitted lifecycle to quinielas table.
--
-- Run this ONCE in Supabase SQL editor.
-- SAFE TO RUN multiple times (all statements are idempotent).
-- =================================================================

-- 1. Add status column (draft by default, existing rows become 'draft')
ALTER TABLE public.quinielas
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted'));

-- 2. Add submitted_at timestamp
ALTER TABLE public.quinielas
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

-- 3. Verify
SELECT id, name, status, submitted_at
FROM public.quinielas
ORDER BY created_at DESC
LIMIT 10;
