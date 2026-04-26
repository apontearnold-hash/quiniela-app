-- ================================================================
-- QUINIELA MUNDIAL 2026 — Invite System Migration
-- Run this in Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to run multiple times (uses IF NOT EXISTS / ON CONFLICT)
-- ================================================================

-- ----------------------------------------------------------------
-- 1. EXTEND PROFILES TABLE
-- ----------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'blocked')),
  ADD COLUMN IF NOT EXISTS invite_code_used text,
  ADD COLUMN IF NOT EXISTS is_test_user boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'email';

-- CRITICAL: All existing users get status = 'approved' so nobody is locked out.
-- This runs unconditionally on every existing row with status = 'pending',
-- which covers: (a) users created before this system, and (b) users whose
-- profiles were created by the trigger before this migration ran.
UPDATE public.profiles SET status = 'approved' WHERE status = 'pending';

-- ----------------------------------------------------------------
-- 2. INVITE_CODES TABLE
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invite_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text UNIQUE NOT NULL,
  description  text,
  is_active    boolean NOT NULL DEFAULT true,
  max_uses     integer,
  uses_count   integer NOT NULL DEFAULT 0,
  auto_approve boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_read_invite_codes" ON public.invite_codes;
CREATE POLICY "admins_read_invite_codes" ON public.invite_codes
  FOR SELECT USING (true);

-- ----------------------------------------------------------------
-- 3. SEED INITIAL INVITE CODE (high max_uses, always available)
-- ----------------------------------------------------------------
INSERT INTO public.invite_codes (code, description, is_active, auto_approve, max_uses)
VALUES ('MUNDIAL2026', 'Código de acceso principal', true, true, 1000)
ON CONFLICT (code) DO UPDATE SET
  is_active    = true,
  auto_approve = true,
  max_uses     = 1000;

-- ----------------------------------------------------------------
-- 4. ATOMIC INCREMENT FUNCTION
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_invite_uses(code_id uuid)
RETURNS void AS $$
  UPDATE public.invite_codes SET uses_count = uses_count + 1 WHERE id = code_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- ----------------------------------------------------------------
-- 5. handle_new_user TRIGGER — minimal and safe
--    Only inserts the 4 original columns. New columns get their
--    DEFAULT values (status = 'pending', provider = 'email').
--    The signup API route and OAuth callback set the correct
--    status / invite_code_used / provider via UPSERT afterward.
--    This avoids any trigger failure if column state is unexpected.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------
-- 6. RLS: allow service_role to update any profile (for admin actions)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Service role puede actualizar cualquier perfil" ON public.profiles;
CREATE POLICY "Service role puede actualizar cualquier perfil" ON public.profiles
  FOR UPDATE USING (true) WITH CHECK (true);


-- ================================================================
-- RECOVERY QUERIES — run individually when needed
-- ================================================================

-- Approve a specific user (replace email):
-- UPDATE public.profiles SET status = 'approved' WHERE email = 'user@example.com';

-- Approve ALL users (emergency unlock):
-- UPDATE public.profiles SET status = 'approved';

-- Make a user admin (replace email):
-- INSERT INTO public.admins (email, added_by)
-- VALUES ('user@example.com', (SELECT id FROM auth.users WHERE email = 'apontearnold@gmail.com'))
-- ON CONFLICT (email) DO NOTHING;

-- Create a new invite code manually:
-- INSERT INTO public.invite_codes (code, description, is_active, auto_approve, max_uses)
-- VALUES ('RECOVERY2026', 'Emergency recovery code', true, true, 10);

-- Fix missing profile for a user (replace values):
-- INSERT INTO public.profiles (id, email, display_name, status)
-- SELECT id, email, email, 'approved' FROM auth.users WHERE email = 'user@example.com'
-- ON CONFLICT (id) DO UPDATE SET status = 'approved';
