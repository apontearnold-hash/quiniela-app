-- quiniela_snapshots: frozen copies of quinielas for audit and recovery
CREATE TABLE IF NOT EXISTS public.quiniela_snapshots (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quiniela_id   UUID        NOT NULL,
  user_id       UUID        NOT NULL,
  pool_id       UUID,
  snapshot_type TEXT        NOT NULL
                CHECK (snapshot_type IN (
                  'initial_submit',
                  'before_r32_sync',
                  'after_r32_submit',
                  'manual_backup',
                  'restore_point'
                )),
  snapshot_data JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID,
  notes         TEXT
);

CREATE INDEX IF NOT EXISTS idx_quiniela_snapshots_quiniela_id
  ON public.quiniela_snapshots (quiniela_id);

CREATE INDEX IF NOT EXISTS idx_quiniela_snapshots_user_id
  ON public.quiniela_snapshots (user_id);

CREATE INDEX IF NOT EXISTS idx_quiniela_snapshots_type
  ON public.quiniela_snapshots (snapshot_type);

ALTER TABLE public.quiniela_snapshots ENABLE ROW LEVEL SECURITY;

-- Users can read their own snapshots (read-only; all writes go through service role)
CREATE POLICY "Users can view own snapshots"
  ON public.quiniela_snapshots FOR SELECT
  USING (auth.uid() = user_id);
