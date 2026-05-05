-- Track when a quiniela's R32 bracket picks were last synced with real team assignments.
-- NULL = user has never accepted the R32 update modal.
-- Non-null = timestamp of last accepted sync; used to detect subsequent R32 changes.

ALTER TABLE public.quinielas
  ADD COLUMN IF NOT EXISTS r32_synced_at TIMESTAMPTZ DEFAULT NULL;
