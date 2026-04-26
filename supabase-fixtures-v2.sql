-- Migración: agregar columnas que faltaban en la tabla fixtures
-- Ejecutar una vez en el editor SQL de Supabase Dashboard.
-- Es seguro correr dos veces (usa IF NOT EXISTS equivalente via DO block).

DO $$
BEGIN

  -- Código de estado crudo de la API (ej. "FT", "NS", "1H")
  -- Complementa el campo "status" que ya existe (que es el valor mapeado a nuestro sistema)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fixtures' AND column_name='status_short') THEN
    ALTER TABLE public.fixtures ADD COLUMN status_short text;
  END IF;

  -- Descripción larga del estado (ej. "Full Time", "Not Started")
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fixtures' AND column_name='status_long') THEN
    ALTER TABLE public.fixtures ADD COLUMN status_long text;
  END IF;

  -- Minutos jugados (null si el partido no ha comenzado)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fixtures' AND column_name='elapsed') THEN
    ALTER TABLE public.fixtures ADD COLUMN elapsed integer;
  END IF;

  -- Estadio donde se juega
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fixtures' AND column_name='venue_name') THEN
    ALTER TABLE public.fixtures ADD COLUMN venue_name text;
  END IF;

  -- Ciudad del estadio
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fixtures' AND column_name='venue_city') THEN
    ALTER TABLE public.fixtures ADD COLUMN venue_city text;
  END IF;

  -- Cuándo actualizó la API este fixture por última vez (timestamp Unix → timestamptz)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fixtures' AND column_name='api_updated_at') THEN
    ALTER TABLE public.fixtures ADD COLUMN api_updated_at timestamptz;
  END IF;

END $$;
