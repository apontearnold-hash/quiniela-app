-- Tabla de historial de sincronizaciones con API-Football
-- Ejecutar una vez en el editor SQL de Supabase Dashboard

CREATE TABLE IF NOT EXISTS public.fixture_sync_log (
  id            bigint generated always as identity primary key,
  sync_type     text not null,       -- 'fixtures' (importar todo) o 'results' (solo scores)
  status        text not null,       -- 'success' o 'error'
  message       text,                -- descripción del resultado o error
  rows_affected integer default 0,  -- número de filas insertadas/actualizadas
  ran_at        timestamptz default now() not null
);

-- Índice para leer el log en orden cronológico inverso (más rápido)
CREATE INDEX IF NOT EXISTS idx_sync_log_ran_at ON public.fixture_sync_log(ran_at DESC);

-- Política de seguridad (RLS)
ALTER TABLE public.fixture_sync_log ENABLE ROW LEVEL SECURITY;

-- Solo el service_role (admin del servidor) puede insertar y leer
CREATE POLICY "service_role gestiona sync_log"
  ON public.fixture_sync_log
  FOR ALL
  USING (auth.role() = 'service_role');
