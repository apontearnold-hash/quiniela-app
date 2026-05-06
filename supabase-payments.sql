-- pool_payments: tracks manual payment records per user per pool
CREATE TABLE IF NOT EXISTS public.pool_payments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id     UUID        NOT NULL REFERENCES public.pools(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_paid NUMERIC     NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  currency    TEXT        NOT NULL DEFAULT 'USD',
  notes       TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID,
  UNIQUE (pool_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pool_payments_pool_id ON public.pool_payments (pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_payments_user_id ON public.pool_payments (user_id);

ALTER TABLE public.pool_payments ENABLE ROW LEVEL SECURITY;

-- Users can read their own payment records only
CREATE POLICY "Users view own payments"
  ON public.pool_payments FOR SELECT
  USING (auth.uid() = user_id);

-- All writes go through service role (admin client) — no client INSERT/UPDATE/DELETE
