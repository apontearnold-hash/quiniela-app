-- ================================================================
-- QUINIELA MUNDIAL 2026 — Update v2 (idempotente)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query → Run
-- Seguro de re-ejecutar: usa IF NOT EXISTS / ON CONFLICT DO NOTHING
-- ================================================================

-- ----------------------------------------------------------------
-- PARTE 1: Columnas nuevas en fixtures
-- ----------------------------------------------------------------
ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS bracket_position text;
ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS home_placeholder text;
ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS away_placeholder text;

-- Ampliar constraint de phase para incluir round_of_32
ALTER TABLE public.fixtures DROP CONSTRAINT IF EXISTS fixtures_phase_check;
ALTER TABLE public.fixtures ADD CONSTRAINT fixtures_phase_check
  CHECK (phase IN ('groups','round_of_32','round_of_16','quarterfinals','semifinals','final'));

-- ----------------------------------------------------------------
-- PARTE 2: Columna is_test en quinielas
-- ----------------------------------------------------------------
ALTER TABLE public.quinielas ADD COLUMN IF NOT EXISTS is_test boolean default false;

-- ----------------------------------------------------------------
-- PARTE 3: Tabla admins (idempotente)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admins (
  id         uuid primary key default gen_random_uuid(),
  email      text unique not null,
  added_by   uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now() not null
);

ALTER TABLE public.admins enable row level security;

DROP POLICY IF EXISTS "Admins se pueden ver entre sí" ON public.admins;
CREATE POLICY "Admins se pueden ver entre sí"
  ON public.admins FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.email IN (SELECT email FROM public.admins)
    )
  );

DROP POLICY IF EXISTS "Solo service_role modifica admins" ON public.admins;
CREATE POLICY "Solo service_role modifica admins"
  ON public.admins FOR ALL
  USING (auth.role() = 'service_role');

INSERT INTO public.admins (email) VALUES ('apontearnold@gmail.com')
  ON CONFLICT (email) DO NOTHING;

-- ----------------------------------------------------------------
-- PARTE 4: Tabla tournament_config (idempotente)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tournament_config (
  id             integer primary key default 1,
  quiniela_price numeric(10,2) default 5.00,
  currency       text default 'USD',
  updated_at     timestamptz default now() not null,
  CHECK (id = 1)
);

ALTER TABLE public.tournament_config enable row level security;

DROP POLICY IF EXISTS "Todos pueden ver config" ON public.tournament_config;
CREATE POLICY "Todos pueden ver config"
  ON public.tournament_config FOR SELECT USING (true);

INSERT INTO public.tournament_config (id, quiniela_price) VALUES (1, 5.00)
  ON CONFLICT (id) DO NOTHING;

-- ================================================================
-- PARTE 5: FASE DE GRUPOS (IDs 1000001–1000072)
-- ================================================================

-- GRUPO A: México, Corea del Sur, Sudáfrica, Chequia
INSERT INTO public.fixtures (id,league_id,season,round,phase,status,kickoff,
  home_team_id,home_team_name,home_team_code,home_team_flag,
  away_team_id,away_team_name,away_team_code,away_team_flag,group_name)
VALUES
(1000001,1,2026,'Grupo A - Jornada 1','groups','not_started','2026-06-11T18:00:00Z',
  201,'México','MEX','https://flagicons.lipis.dev/flags/4x3/mx.svg',
  202,'Corea del Sur','KOR','https://flagicons.lipis.dev/flags/4x3/kr.svg','Grupo A'),
(1000002,1,2026,'Grupo A - Jornada 1','groups','not_started','2026-06-11T21:00:00Z',
  203,'Sudáfrica','RSA','https://flagicons.lipis.dev/flags/4x3/za.svg',
  204,'Chequia','CZE','https://flagicons.lipis.dev/flags/4x3/cz.svg','Grupo A'),
(1000003,1,2026,'Grupo A - Jornada 2','groups','not_started','2026-06-17T18:00:00Z',
  201,'México','MEX','https://flagicons.lipis.dev/flags/4x3/mx.svg',
  203,'Sudáfrica','RSA','https://flagicons.lipis.dev/flags/4x3/za.svg','Grupo A'),
(1000004,1,2026,'Grupo A - Jornada 2','groups','not_started','2026-06-17T21:00:00Z',
  202,'Corea del Sur','KOR','https://flagicons.lipis.dev/flags/4x3/kr.svg',
  204,'Chequia','CZE','https://flagicons.lipis.dev/flags/4x3/cz.svg','Grupo A'),
(1000005,1,2026,'Grupo A - Jornada 3','groups','not_started','2026-06-23T20:00:00Z',
  201,'México','MEX','https://flagicons.lipis.dev/flags/4x3/mx.svg',
  204,'Chequia','CZE','https://flagicons.lipis.dev/flags/4x3/cz.svg','Grupo A'),
(1000006,1,2026,'Grupo A - Jornada 3','groups','not_started','2026-06-23T20:00:00Z',
  202,'Corea del Sur','KOR','https://flagicons.lipis.dev/flags/4x3/kr.svg',
  203,'Sudáfrica','RSA','https://flagicons.lipis.dev/flags/4x3/za.svg','Grupo A')
ON CONFLICT (id) DO NOTHING;

-- GRUPO B: Canadá, Suiza, Qatar, Bosnia y Herzegovina
INSERT INTO public.fixtures (id,league_id,season,round,phase,status,kickoff,
  home_team_id,home_team_name,home_team_code,home_team_flag,
  away_team_id,away_team_name,away_team_code,away_team_flag,group_name)
VALUES
(1000007,1,2026,'Grupo B - Jornada 1','groups','not_started','2026-06-11T15:00:00Z',
  205,'Canadá','CAN','https://flagicons.lipis.dev/flags/4x3/ca.svg',
  206,'Suiza','SUI','https://flagicons.lipis.dev/flags/4x3/ch.svg','Grupo B'),
(1000008,1,2026,'Grupo B - Jornada 1','groups','not_started','2026-06-11T18:00:00Z',
  207,'Qatar','QAT','https://flagicons.lipis.dev/flags/4x3/qa.svg',
  208,'Bosnia y Herzegovina','BIH','https://flagicons.lipis.dev/flags/4x3/ba.svg','Grupo B'),
(1000009,1,2026,'Grupo B - Jornada 2','groups','not_started','2026-06-17T15:00:00Z',
  205,'Canadá','CAN','https://flagicons.lipis.dev/flags/4x3/ca.svg',
  207,'Qatar','QAT','https://flagicons.lipis.dev/flags/4x3/qa.svg','Grupo B'),
(1000010,1,2026,'Grupo B - Jornada 2','groups','not_started','2026-06-17T18:00:00Z',
  206,'Suiza','SUI','https://flagicons.lipis.dev/flags/4x3/ch.svg',
  208,'Bosnia y Herzegovina','BIH','https://flagicons.lipis.dev/flags/4x3/ba.svg','Grupo B'),
(1000011,1,2026,'Grupo B - Jornada 3','groups','not_started','2026-06-23T17:00:00Z',
  205,'Canadá','CAN','https://flagicons.lipis.dev/flags/4x3/ca.svg',
  208,'Bosnia y Herzegovina','BIH','https://flagicons.lipis.dev/flags/4x3/ba.svg','Grupo B'),
(1000012,1,2026,'Grupo B - Jornada 3','groups','not_started','2026-06-23T17:00:00Z',
  206,'Suiza','SUI','https://flagicons.lipis.dev/flags/4x3/ch.svg',
  207,'Qatar','QAT','https://flagicons.lipis.dev/flags/4x3/qa.svg','Grupo B')
ON CONFLICT (id) DO NOTHING;

-- GRUPO C: Brasil, Marruecos, Escocia, Haití
INSERT INTO public.fixtures (id,league_id,season,round,phase,status,kickoff,
  home_team_id,home_team_name,home_team_code,home_team_flag,
  away_team_id,away_team_name,away_team_code,away_team_flag,group_name)
VALUES
(1000013,1,2026,'Grupo C - Jornada 1','groups','not_started','2026-06-12T18:00:00Z',
  209,'Brasil','BRA','https://flagicons.lipis.dev/flags/4x3/br.svg',
  210,'Marruecos','MAR','https://flagicons.lipis.dev/flags/4x3/ma.svg','Grupo C'),
(1000014,1,2026,'Grupo C - Jornada 1','groups','not_started','2026-06-12T21:00:00Z',
  211,'Escocia','SCO','https://flagicons.lipis.dev/flags/4x3/gb-sct.svg',
  212,'Haití','HAI','https://flagicons.lipis.dev/flags/4x3/ht.svg','Grupo C'),
(1000015,1,2026,'Grupo C - Jornada 2','groups','not_started','2026-06-18T18:00:00Z',
  209,'Brasil','BRA','https://flagicons.lipis.dev/flags/4x3/br.svg',
  211,'Escocia','SCO','https://flagicons.lipis.dev/flags/4x3/gb-sct.svg','Grupo C'),
(1000016,1,2026,'Grupo C - Jornada 2','groups','not_started','2026-06-18T21:00:00Z',
  210,'Marruecos','MAR','https://flagicons.lipis.dev/flags/4x3/ma.svg',
  212,'Haití','HAI','https://flagicons.lipis.dev/flags/4x3/ht.svg','Grupo C'),
(1000017,1,2026,'Grupo C - Jornada 3','groups','not_started','2026-06-24T20:00:00Z',
  209,'Brasil','BRA','https://flagicons.lipis.dev/flags/4x3/br.svg',
  212,'Haití','HAI','https://flagicons.lipis.dev/flags/4x3/ht.svg','Grupo C'),
(1000018,1,2026,'Grupo C - Jornada 3','groups','not_started','2026-06-24T20:00:00Z',
  210,'Marruecos','MAR','https://flagicons.lipis.dev/flags/4x3/ma.svg',
  211,'Escocia','SCO','https://flagicons.lipis.dev/flags/4x3/gb-sct.svg','Grupo C')
ON CONFLICT (id) DO NOTHING;

-- GRUPO D: USA, Australia, Paraguay, Turquía
INSERT INTO public.fixtures (id,league_id,season,round,phase,status,kickoff,
  home_team_id,home_team_name,home_team_code,home_team_flag,
  away_team_id,away_team_name,away_team_code,away_team_flag,group_name)
VALUES
(1000019,1,2026,'Grupo D - Jornada 1','groups','not_started','2026-06-12T15:00:00Z',
  213,'USA','USA','https://flagicons.lipis.dev/flags/4x3/us.svg',
  214,'Australia','AUS','https://flagicons.lipis.dev/flags/4x3/au.svg','Grupo D'),
(1000020,1,2026,'Grupo D - Jornada 1','groups','not_started','2026-06-12T18:00:00Z',
  215,'Paraguay','PAR','https://flagicons.lipis.dev/flags/4x3/py.svg',
  216,'Turquía','TUR','https://flagicons.lipis.dev/flags/4x3/tr.svg','Grupo D'),
(1000021,1,2026,'Grupo D - Jornada 2','groups','not_started','2026-06-18T15:00:00Z',
  213,'USA','USA','https://flagicons.lipis.dev/flags/4x3/us.svg',
  215,'Paraguay','PAR','https://flagicons.lipis.dev/flags/4x3/py.svg','Grupo D'),
(1000022,1,2026,'Grupo D - Jornada 2','groups','not_started','2026-06-18T18:00:00Z',
  214,'Australia','AUS','https://flagicons.lipis.dev/flags/4x3/au.svg',
  216,'Turquía','TUR','https://flagicons.lipis.dev/flags/4x3/tr.svg','Grupo D'),
(1000023,1,2026,'Grupo D - Jornada 3','groups','not_started','2026-06-24T17:00:00Z',
  213,'USA','USA','https://flagicons.lipis.dev/flags/4x3/us.svg',
  216,'Turquía','TUR','https://flagicons.lipis.dev/flags/4x3/tr.svg','Grupo D'),
(1000024,1,2026,'Grupo D - Jornada 3','groups','not_started','2026-06-24T17:00:00Z',
  214,'Australia','AUS','https://flagicons.lipis.dev/flags/4x3/au.svg',
  215,'Paraguay','PAR','https://flagicons.lipis.dev/flags/4x3/py.svg','Grupo D')
ON CONFLICT (id) DO NOTHING;

-- GRUPO E: Alemania, Ecuador, Costa de Marfil, Curazao
INSERT INTO public.fixtures (id,league_id,season,round,phase,status,kickoff,
  home_team_id,home_team_name,home_team_code,home_team_flag,
  away_team_id,away_team_name,away_team_code,away_team_flag,group_name)
VALUES
(1000025,1,2026,'Grupo E - Jornada 1','groups','not_started','2026-06-13T18:00:00Z',
  217,'Alemania','GER','https://flagicons.lipis.dev/flags/4x3/de.svg',
  218,'Ecuador','ECU','https://flagicons.lipis.dev/flags/4x3/ec.svg','Grupo E'),
(1000026,1,2026,'Grupo E - Jornada 1','groups','not_started','2026-06-13T21:00:00Z',
  219,'Costa de Marfil','CIV','https://flagicons.lipis.dev/flags/4x3/ci.svg',
  220,'Curazao','CUW','https://flagicons.lipis.dev/flags/4x3/cw.svg','Grupo E'),
(1000027,1,2026,'Grupo E - Jornada 2','groups','not_started','2026-06-19T18:00:00Z',
  217,'Alemania','GER','https://flagicons.lipis.dev/flags/4x3/de.svg',
  219,'Costa de Marfil','CIV','https://flagicons.lipis.dev/flags/4x3/ci.svg','Grupo E'),
(1000028,1,2026,'Grupo E - Jornada 2','groups','not_started','2026-06-19T21:00:00Z',
  218,'Ecuador','ECU','https://flagicons.lipis.dev/flags/4x3/ec.svg',
  220,'Curazao','CUW','https://flagicons.lipis.dev/flags/4x3/cw.svg','Grupo E'),
(1000029,1,2026,'Grupo E - Jornada 3','groups','not_started','2026-06-25T20:00:00Z',
  217,'Alemania','GER','https://flagicons.lipis.dev/flags/4x3/de.svg',
  220,'Curazao','CUW','https://flagicons.lipis.dev/flags/4x3/cw.svg','Grupo E'),
(1000030,1,2026,'Grupo E - Jornada 3','groups','not_started','2026-06-25T20:00:00Z',
  218,'Ecuador','ECU','https://flagicons.lipis.dev/flags/4x3/ec.svg',
  219,'Costa de Marfil','CIV','https://flagicons.lipis.dev/flags/4x3/ci.svg','Grupo E')
ON CONFLICT (id) DO NOTHING;

-- GRUPO F: Países Bajos, Japón, Túnez, Suecia
INSERT INTO public.fixtures (id,league_id,season,round,phase,status,kickoff,
  home_team_id,home_team_name,home_team_code,home_team_flag,
  away_team_id,away_team_name,away_team_code,away_team_flag,group_name)
VALUES
(1000031,1,2026,'Grupo F - Jornada 1','groups','not_started','2026-06-13T15:00:00Z',
  221,'Países Bajos','NED','https://flagicons.lipis.dev/flags/4x3/nl.svg',
  222,'Japón','JPN','https://flagicons.lipis.dev/flags/4x3/jp.svg','Grupo F'),
(1000032,1,2026,'Grupo F - Jornada 1','groups','not_started','2026-06-13T18:00:00Z',
  223,'Túnez','TUN','https://flagicons.lipis.dev/flags/4x3/tn.svg',
  224,'Suecia','SWE','https://flagicons.lipis.dev/flags/4x3/se.svg','Grupo F'),
(1000033,1,2026,'Grupo F - Jornada 2','groups','not_started','2026-06-19T15:00:00Z',
  221,'Países Bajos','NED','https://flagicons.lipis.dev/flags/4x3/nl.svg',
  223,'Túnez','TUN','https://flagicons.lipis.dev/flags/4x3/tn.svg','Grupo F'),
(1000034,1,2026,'Grupo F - Jornada 2','groups','not_started','2026-06-19T18:00:00Z',
  222,'Japón','JPN','https://flagicons.lipis.dev/flags/4x3/jp.svg',
  224,'Suecia','SWE','https://flagicons.lipis.dev/flags/4x3/se.svg','Grupo F'),
(1000035,1,2026,'Grupo F - Jornada 3','groups','not_started','2026-06-25T17:00:00Z',
  221,'Países Bajos','NED','https://flagicons.lipis.dev/flags/4x3/nl.svg',
  224,'Suecia','SWE','https://flagicons.lipis.dev/flags/4x3/se.svg','Grupo F'),
(1000036,1,2026,'Grupo F - Jornada 3','groups','not_started','2026-06-25T17:00:00Z',
  222,'Japón','JPN','https://flagicons.lipis.dev/flags/4x3/jp.svg',
  223,'Túnez','TUN','https://flagicons.lipis.dev/flags/4x3/tn.svg','Grupo F')
ON CONFLICT (id) DO NOTHING;

-- GRUPO G: Bélgica, Irán, Egipto, Nueva Zelanda
INSERT INTO public.fixtures (id,league_id,season,round,phase,status,kickoff,
  home_team_id,home_team_name,home_team_code,home_team_flag,
  away_team_id,away_team_name,away_team_code,away_team_flag,group_name)
VALUES
(1000037,1,2026,'Grupo G - Jornada 1','groups','not_started','2026-06-14T18:00:00Z',
  225,'Bélgica','BEL','https://flagicons.lipis.dev/flags/4x3/be.svg',
  226,'Irán','IRN','https://flagicons.lipis.dev/flags/4x3/ir.svg','Grupo G'),
(1000038,1,2026,'Grupo G - Jornada 1','groups','not_started','2026-06-14T21:00:00Z',
  227,'Egipto','EGY','https://flagicons.lipis.dev/flags/4x3/eg.svg',
  228,'Nueva Zelanda','NZL','https://flagicons.lipis.dev/flags/4x3/nz.svg','Grupo G'),
(1000039,1,2026,'Grupo G - Jornada 2','groups','not_started','2026-06-20T18:00:00Z',
  225,'Bélgica','BEL','https://flagicons.lipis.dev/flags/4x3/be.svg',
  227,'Egipto','EGY','https://flagicons.lipis.dev/flags/4x3/eg.svg','Grupo G'),
(1000040,1,2026,'Grupo G - Jornada 2','groups','not_started','2026-06-20T21:00:00Z',
  226,'Irán','IRN','https://flagicons.lipis.dev/flags/4x3/ir.svg',
  228,'Nueva Zelanda','NZL','https://flagicons.lipis.dev/flags/4x3/nz.svg','Grupo G'),
(1000041,1,2026,'Grupo G - Jornada 3','groups','not_started','2026-06-26T20:00:00Z',
  225,'Bélgica','BEL','https://flagicons.lipis.dev/flags/4x3/be.svg',
  228,'Nueva Zelanda','NZL','https://flagicons.lipis.dev/flags/4x3/nz.svg','Grupo G'),
(1000042,1,2026,'Grupo G - Jornada 3','groups','not_started','2026-06-26T20:00:00Z',
  226,'Irán','IRN','https://flagicons.lipis.dev/flags/4x3/ir.svg',
  227,'Egipto','EGY','https://flagicons.lipis.dev/flags/4x3/eg.svg','Grupo G')
ON CONFLICT (id) DO NOTHING;

-- GRUPO H: España, Uruguay, Arabia Saudita, Cabo Verde
INSERT INTO public.fixtures (id,league_id,season,round,phase,status,kickoff,
  home_team_id,home_team_name,home_team_code,home_team_flag,
  away_team_id,away_team_name,away_team_code,away_team_flag,group_name)
VALUES
(1000043,1,2026,'Grupo H - Jornada 1','groups','not_started','2026-06-14T15:00:00Z',
  229,'España','ESP','https://flagicons.lipis.dev/flags/4x3/es.svg',
  230,'Uruguay','URU','https://flagicons.lipis.dev/flags/4x3/uy.svg','Grupo H'),
(1000044,1,2026,'Grupo H - Jornada 1','groups','not_started','2026-06-14T18:00:00Z',
  231,'Arabia Saudita','KSA','https://flagicons.lipis.dev/flags/4x3/sa.svg',
  232,'Cabo Verde','CPV','https://flagicons.lipis.dev/flags/4x3/cv.svg','Grupo H'),
(1000045,1,2026,'Grupo H - Jornada 2','groups','not_started','2026-06-20T15:00:00Z',
  229,'España','ESP','https://flagicons.lipis.dev/flags/4x3/es.svg',
  231,'Arabia Saudita','KSA','https://flagicons.lipis.dev/flags/4x3/sa.svg','Grupo H'),
(1000046,1,2026,'Grupo H - Jornada 2','groups','not_started','2026-06-20T18:00:00Z',
  230,'Uruguay','URU','https://flagicons.lipis.dev/flags/4x3/uy.svg',
  232,'Cabo Verde','CPV','https://flagicons.lipis.dev/flags/4x3/cv.svg','Grupo H'),
(1000047,1,2026,'Grupo H - Jornada 3','groups','not_started','2026-06-26T17:00:00Z',
  229,'España','ESP','https://flagicons.lipis.dev/flags/4x3/es.svg',
  232,'Cabo Verde','CPV','https://flagicons.lipis.dev/flags/4x3/cv.svg','Grupo H'),
(1000048,1,2026,'Grupo H - Jornada 3','groups','not_started','2026-06-26T17:00:00Z',
  230,'Uruguay','URU','https://flagicons.lipis.dev/flags/4x3/uy.svg',
  231,'Arabia Saudita','KSA','https://flagicons.lipis.dev/flags/4x3/sa.svg','Grupo H')
ON CONFLICT (id) DO NOTHING;

-- GRUPO I: Francia, Senegal, Noruega, Iraq
INSERT INTO public.fixtures (id,league_id,season,round,phase,status,kickoff,
  home_team_id,home_team_name,home_team_code,home_team_flag,
  away_team_id,away_team_name,away_team_code,away_team_flag,group_name)
VALUES
(1000049,1,2026,'Grupo I - Jornada 1','groups','not_started','2026-06-15T18:00:00Z',
  233,'Francia','FRA','https://flagicons.lipis.dev/flags/4x3/fr.svg',
  234,'Senegal','SEN','https://flagicons.lipis.dev/flags/4x3/sn.svg','Grupo I'),
(1000050,1,2026,'Grupo I - Jornada 1','groups','not_started','2026-06-15T21:00:00Z',
  235,'Noruega','NOR','https://flagicons.lipis.dev/flags/4x3/no.svg',
  236,'Iraq','IRQ','https://flagicons.lipis.dev/flags/4x3/iq.svg','Grupo I'),
(1000051,1,2026,'Grupo I - Jornada 2','groups','not_started','2026-06-21T18:00:00Z',
  233,'Francia','FRA','https://flagicons.lipis.dev/flags/4x3/fr.svg',
  235,'Noruega','NOR','https://flagicons.lipis.dev/flags/4x3/no.svg','Grupo I'),
(1000052,1,2026,'Grupo I - Jornada 2','groups','not_started','2026-06-21T21:00:00Z',
  234,'Senegal','SEN','https://flagicons.lipis.dev/flags/4x3/sn.svg',
  236,'Iraq','IRQ','https://flagicons.lipis.dev/flags/4x3/iq.svg','Grupo I'),
(1000053,1,2026,'Grupo I - Jornada 3','groups','not_started','2026-06-27T20:00:00Z',
  233,'Francia','FRA','https://flagicons.lipis.dev/flags/4x3/fr.svg',
  236,'Iraq','IRQ','https://flagicons.lipis.dev/flags/4x3/iq.svg','Grupo I'),
(1000054,1,2026,'Grupo I - Jornada 3','groups','not_started','2026-06-27T20:00:00Z',
  234,'Senegal','SEN','https://flagicons.lipis.dev/flags/4x3/sn.svg',
  235,'Noruega','NOR','https://flagicons.lipis.dev/flags/4x3/no.svg','Grupo I')
ON CONFLICT (id) DO NOTHING;

-- GRUPO J: Argentina, Austria, Argelia, Jordania
INSERT INTO public.fixtures (id,league_id,season,round,phase,status,kickoff,
  home_team_id,home_team_name,home_team_code,home_team_flag,
  away_team_id,away_team_name,away_team_code,away_team_flag,group_name)
VALUES
(1000055,1,2026,'Grupo J - Jornada 1','groups','not_started','2026-06-15T15:00:00Z',
  237,'Argentina','ARG','https://flagicons.lipis.dev/flags/4x3/ar.svg',
  238,'Austria','AUT','https://flagicons.lipis.dev/flags/4x3/at.svg','Grupo J'),
(1000056,1,2026,'Grupo J - Jornada 1','groups','not_started','2026-06-15T18:00:00Z',
  239,'Argelia','ALG','https://flagicons.lipis.dev/flags/4x3/dz.svg',
  240,'Jordania','JOR','https://flagicons.lipis.dev/flags/4x3/jo.svg','Grupo J'),
(1000057,1,2026,'Grupo J - Jornada 2','groups','not_started','2026-06-21T15:00:00Z',
  237,'Argentina','ARG','https://flagicons.lipis.dev/flags/4x3/ar.svg',
  239,'Argelia','ALG','https://flagicons.lipis.dev/flags/4x3/dz.svg','Grupo J'),
(1000058,1,2026,'Grupo J - Jornada 2','groups','not_started','2026-06-21T18:00:00Z',
  238,'Austria','AUT','https://flagicons.lipis.dev/flags/4x3/at.svg',
  240,'Jordania','JOR','https://flagicons.lipis.dev/flags/4x3/jo.svg','Grupo J'),
(1000059,1,2026,'Grupo J - Jornada 3','groups','not_started','2026-06-27T17:00:00Z',
  237,'Argentina','ARG','https://flagicons.lipis.dev/flags/4x3/ar.svg',
  240,'Jordania','JOR','https://flagicons.lipis.dev/flags/4x3/jo.svg','Grupo J'),
(1000060,1,2026,'Grupo J - Jornada 3','groups','not_started','2026-06-27T17:00:00Z',
  238,'Austria','AUT','https://flagicons.lipis.dev/flags/4x3/at.svg',
  239,'Argelia','ALG','https://flagicons.lipis.dev/flags/4x3/dz.svg','Grupo J')
ON CONFLICT (id) DO NOTHING;

-- GRUPO K: Portugal, Colombia, Uzbekistán, RD Congo
INSERT INTO public.fixtures (id,league_id,season,round,phase,status,kickoff,
  home_team_id,home_team_name,home_team_code,home_team_flag,
  away_team_id,away_team_name,away_team_code,away_team_flag,group_name)
VALUES
(1000061,1,2026,'Grupo K - Jornada 1','groups','not_started','2026-06-16T18:00:00Z',
  241,'Portugal','POR','https://flagicons.lipis.dev/flags/4x3/pt.svg',
  242,'Colombia','COL','https://flagicons.lipis.dev/flags/4x3/co.svg','Grupo K'),
(1000062,1,2026,'Grupo K - Jornada 1','groups','not_started','2026-06-16T21:00:00Z',
  243,'Uzbekistán','UZB','https://flagicons.lipis.dev/flags/4x3/uz.svg',
  244,'RD Congo','COD','https://flagicons.lipis.dev/flags/4x3/cd.svg','Grupo K'),
(1000063,1,2026,'Grupo K - Jornada 2','groups','not_started','2026-06-22T18:00:00Z',
  241,'Portugal','POR','https://flagicons.lipis.dev/flags/4x3/pt.svg',
  243,'Uzbekistán','UZB','https://flagicons.lipis.dev/flags/4x3/uz.svg','Grupo K'),
(1000064,1,2026,'Grupo K - Jornada 2','groups','not_started','2026-06-22T21:00:00Z',
  242,'Colombia','COL','https://flagicons.lipis.dev/flags/4x3/co.svg',
  244,'RD Congo','COD','https://flagicons.lipis.dev/flags/4x3/cd.svg','Grupo K'),
(1000065,1,2026,'Grupo K - Jornada 3','groups','not_started','2026-06-28T20:00:00Z',
  241,'Portugal','POR','https://flagicons.lipis.dev/flags/4x3/pt.svg',
  244,'RD Congo','COD','https://flagicons.lipis.dev/flags/4x3/cd.svg','Grupo K'),
(1000066,1,2026,'Grupo K - Jornada 3','groups','not_started','2026-06-28T20:00:00Z',
  242,'Colombia','COL','https://flagicons.lipis.dev/flags/4x3/co.svg',
  243,'Uzbekistán','UZB','https://flagicons.lipis.dev/flags/4x3/uz.svg','Grupo K')
ON CONFLICT (id) DO NOTHING;

-- GRUPO L: Inglaterra, Croacia, Panamá, Ghana
INSERT INTO public.fixtures (id,league_id,season,round,phase,status,kickoff,
  home_team_id,home_team_name,home_team_code,home_team_flag,
  away_team_id,away_team_name,away_team_code,away_team_flag,group_name)
VALUES
(1000067,1,2026,'Grupo L - Jornada 1','groups','not_started','2026-06-16T15:00:00Z',
  245,'Inglaterra','ENG','https://flagicons.lipis.dev/flags/4x3/gb-eng.svg',
  246,'Croacia','CRO','https://flagicons.lipis.dev/flags/4x3/hr.svg','Grupo L'),
(1000068,1,2026,'Grupo L - Jornada 1','groups','not_started','2026-06-16T18:00:00Z',
  247,'Panamá','PAN','https://flagicons.lipis.dev/flags/4x3/pa.svg',
  248,'Ghana','GHA','https://flagicons.lipis.dev/flags/4x3/gh.svg','Grupo L'),
(1000069,1,2026,'Grupo L - Jornada 2','groups','not_started','2026-06-22T15:00:00Z',
  245,'Inglaterra','ENG','https://flagicons.lipis.dev/flags/4x3/gb-eng.svg',
  247,'Panamá','PAN','https://flagicons.lipis.dev/flags/4x3/pa.svg','Grupo L'),
(1000070,1,2026,'Grupo L - Jornada 2','groups','not_started','2026-06-22T18:00:00Z',
  246,'Croacia','CRO','https://flagicons.lipis.dev/flags/4x3/hr.svg',
  248,'Ghana','GHA','https://flagicons.lipis.dev/flags/4x3/gh.svg','Grupo L'),
(1000071,1,2026,'Grupo L - Jornada 3','groups','not_started','2026-06-28T17:00:00Z',
  245,'Inglaterra','ENG','https://flagicons.lipis.dev/flags/4x3/gb-eng.svg',
  248,'Ghana','GHA','https://flagicons.lipis.dev/flags/4x3/gh.svg','Grupo L'),
(1000072,1,2026,'Grupo L - Jornada 3','groups','not_started','2026-06-28T17:00:00Z',
  246,'Croacia','CRO','https://flagicons.lipis.dev/flags/4x3/hr.svg',
  247,'Panamá','PAN','https://flagicons.lipis.dev/flags/4x3/pa.svg','Grupo L')
ON CONFLICT (id) DO NOTHING;

-- ================================================================
-- PARTE 6: RONDA DE 32 (IDs 1000073–1000088)
-- ================================================================
INSERT INTO public.fixtures (id,league_id,season,round,phase,status,kickoff,bracket_position,home_placeholder,away_placeholder)
VALUES
(1000073,1,2026,'Round of 32','round_of_32','not_started','2026-06-29T17:00:00Z','R32-01','1ro Grupo A','2do Grupo B'),
(1000074,1,2026,'Round of 32','round_of_32','not_started','2026-06-29T20:00:00Z','R32-02','1ro Grupo C','2do Grupo F'),
(1000075,1,2026,'Round of 32','round_of_32','not_started','2026-06-30T17:00:00Z','R32-03','1ro Grupo E','Mejor 3ro (A/B/C/D/F)'),
(1000076,1,2026,'Round of 32','round_of_32','not_started','2026-06-30T20:00:00Z','R32-04','1ro Grupo F','2do Grupo C'),
(1000077,1,2026,'Round of 32','round_of_32','not_started','2026-07-01T17:00:00Z','R32-05','2do Grupo E','2do Grupo I'),
(1000078,1,2026,'Round of 32','round_of_32','not_started','2026-07-01T20:00:00Z','R32-06','1ro Grupo I','Mejor 3ro (C/D/F/G/H)'),
(1000079,1,2026,'Round of 32','round_of_32','not_started','2026-07-02T17:00:00Z','R32-07','2do Grupo A','Mejor 3ro (C/E/F/H/I)'),
(1000080,1,2026,'Round of 32','round_of_32','not_started','2026-07-02T20:00:00Z','R32-08','1ro Grupo L','Mejor 3ro (E/H/I/J/K)'),
(1000081,1,2026,'Round of 32','round_of_32','not_started','2026-07-03T17:00:00Z','R32-09','1ro Grupo G','Mejor 3ro (A/E/H/I/J)'),
(1000082,1,2026,'Round of 32','round_of_32','not_started','2026-07-03T20:00:00Z','R32-10','1ro Grupo D','Mejor 3ro (B/E/F/I/J)'),
(1000083,1,2026,'Round of 32','round_of_32','not_started','2026-07-04T17:00:00Z','R32-11','1ro Grupo H','2do Grupo J'),
(1000084,1,2026,'Round of 32','round_of_32','not_started','2026-07-04T20:00:00Z','R32-12','2do Grupo K','2do Grupo L'),
(1000085,1,2026,'Round of 32','round_of_32','not_started','2026-07-05T17:00:00Z','R32-13','1ro Grupo B','Mejor 3ro (E/F/G/I/J)'),
(1000086,1,2026,'Round of 32','round_of_32','not_started','2026-07-05T20:00:00Z','R32-14','2do Grupo D','2do Grupo G'),
(1000087,1,2026,'Round of 32','round_of_32','not_started','2026-07-06T17:00:00Z','R32-15','1ro Grupo J','2do Grupo H'),
(1000088,1,2026,'Round of 32','round_of_32','not_started','2026-07-06T20:00:00Z','R32-16','1ro Grupo K','Mejor 3ro (D/E/I/J/L)')
ON CONFLICT (id) DO NOTHING;

-- ================================================================
-- PARTE 7: OCTAVOS DE FINAL (IDs 1000089–1000096)
-- ================================================================
INSERT INTO public.fixtures (id,league_id,season,round,phase,status,kickoff,bracket_position,home_placeholder,away_placeholder)
VALUES
(1000089,1,2026,'Round of 16','round_of_16','not_started','2026-07-08T17:00:00Z','R16-01','Ganador R32-01','Ganador R32-02'),
(1000090,1,2026,'Round of 16','round_of_16','not_started','2026-07-08T20:00:00Z','R16-02','Ganador R32-03','Ganador R32-04'),
(1000091,1,2026,'Round of 16','round_of_16','not_started','2026-07-09T17:00:00Z','R16-03','Ganador R32-05','Ganador R32-06'),
(1000092,1,2026,'Round of 16','round_of_16','not_started','2026-07-09T20:00:00Z','R16-04','Ganador R32-07','Ganador R32-08'),
(1000093,1,2026,'Round of 16','round_of_16','not_started','2026-07-10T17:00:00Z','R16-05','Ganador R32-09','Ganador R32-10'),
(1000094,1,2026,'Round of 16','round_of_16','not_started','2026-07-10T20:00:00Z','R16-06','Ganador R32-11','Ganador R32-12'),
(1000095,1,2026,'Round of 16','round_of_16','not_started','2026-07-11T17:00:00Z','R16-07','Ganador R32-13','Ganador R32-14'),
(1000096,1,2026,'Round of 16','round_of_16','not_started','2026-07-11T20:00:00Z','R16-08','Ganador R32-15','Ganador R32-16')
ON CONFLICT (id) DO NOTHING;

-- ================================================================
-- PARTE 8: CUARTOS DE FINAL (IDs 1000097–1000100)
-- ================================================================
INSERT INTO public.fixtures (id,league_id,season,round,phase,status,kickoff,bracket_position,home_placeholder,away_placeholder)
VALUES
(1000097,1,2026,'Cuartos de Final','quarterfinals','not_started','2026-07-14T17:00:00Z','QF-01','Ganador R16-01','Ganador R16-02'),
(1000098,1,2026,'Cuartos de Final','quarterfinals','not_started','2026-07-14T20:00:00Z','QF-02','Ganador R16-03','Ganador R16-04'),
(1000099,1,2026,'Cuartos de Final','quarterfinals','not_started','2026-07-15T17:00:00Z','QF-03','Ganador R16-05','Ganador R16-06'),
(1000100,1,2026,'Cuartos de Final','quarterfinals','not_started','2026-07-15T20:00:00Z','QF-04','Ganador R16-07','Ganador R16-08')
ON CONFLICT (id) DO NOTHING;

-- ================================================================
-- PARTE 9: SEMIFINALES (IDs 1000101–1000102)
-- ================================================================
INSERT INTO public.fixtures (id,league_id,season,round,phase,status,kickoff,bracket_position,home_placeholder,away_placeholder)
VALUES
(1000101,1,2026,'Semifinal','semifinals','not_started','2026-07-18T20:00:00Z','SF-01','Ganador QF-01','Ganador QF-02'),
(1000102,1,2026,'Semifinal','semifinals','not_started','2026-07-19T20:00:00Z','SF-02','Ganador QF-03','Ganador QF-04')
ON CONFLICT (id) DO NOTHING;

-- ================================================================
-- PARTE 10: TERCER LUGAR + FINAL
-- ================================================================
INSERT INTO public.fixtures (id,league_id,season,round,phase,status,kickoff,bracket_position,home_placeholder,away_placeholder)
VALUES
(1000103,1,2026,'Tercer Lugar','semifinals','not_started','2026-07-21T17:00:00Z','3P','Perdedor SF-01','Perdedor SF-02'),
(1000104,1,2026,'Final','final','not_started','2026-07-22T20:00:00Z','FIN','Ganador SF-01','Ganador SF-02')
ON CONFLICT (id) DO NOTHING;

-- ================================================================
-- PARTE 11: Tabla groups — 48 equipos
-- ================================================================
INSERT INTO public.groups (group_name,team_id,team_name,team_flag,team_code)
VALUES
('Grupo A',201,'México','https://flagicons.lipis.dev/flags/4x3/mx.svg','MEX'),
('Grupo A',202,'Corea del Sur','https://flagicons.lipis.dev/flags/4x3/kr.svg','KOR'),
('Grupo A',203,'Sudáfrica','https://flagicons.lipis.dev/flags/4x3/za.svg','RSA'),
('Grupo A',204,'Chequia','https://flagicons.lipis.dev/flags/4x3/cz.svg','CZE'),
('Grupo B',205,'Canadá','https://flagicons.lipis.dev/flags/4x3/ca.svg','CAN'),
('Grupo B',206,'Suiza','https://flagicons.lipis.dev/flags/4x3/ch.svg','SUI'),
('Grupo B',207,'Qatar','https://flagicons.lipis.dev/flags/4x3/qa.svg','QAT'),
('Grupo B',208,'Bosnia y Herzegovina','https://flagicons.lipis.dev/flags/4x3/ba.svg','BIH'),
('Grupo C',209,'Brasil','https://flagicons.lipis.dev/flags/4x3/br.svg','BRA'),
('Grupo C',210,'Marruecos','https://flagicons.lipis.dev/flags/4x3/ma.svg','MAR'),
('Grupo C',211,'Escocia','https://flagicons.lipis.dev/flags/4x3/gb-sct.svg','SCO'),
('Grupo C',212,'Haití','https://flagicons.lipis.dev/flags/4x3/ht.svg','HAI'),
('Grupo D',213,'USA','https://flagicons.lipis.dev/flags/4x3/us.svg','USA'),
('Grupo D',214,'Australia','https://flagicons.lipis.dev/flags/4x3/au.svg','AUS'),
('Grupo D',215,'Paraguay','https://flagicons.lipis.dev/flags/4x3/py.svg','PAR'),
('Grupo D',216,'Turquía','https://flagicons.lipis.dev/flags/4x3/tr.svg','TUR'),
('Grupo E',217,'Alemania','https://flagicons.lipis.dev/flags/4x3/de.svg','GER'),
('Grupo E',218,'Ecuador','https://flagicons.lipis.dev/flags/4x3/ec.svg','ECU'),
('Grupo E',219,'Costa de Marfil','https://flagicons.lipis.dev/flags/4x3/ci.svg','CIV'),
('Grupo E',220,'Curazao','https://flagicons.lipis.dev/flags/4x3/cw.svg','CUW'),
('Grupo F',221,'Países Bajos','https://flagicons.lipis.dev/flags/4x3/nl.svg','NED'),
('Grupo F',222,'Japón','https://flagicons.lipis.dev/flags/4x3/jp.svg','JPN'),
('Grupo F',223,'Túnez','https://flagicons.lipis.dev/flags/4x3/tn.svg','TUN'),
('Grupo F',224,'Suecia','https://flagicons.lipis.dev/flags/4x3/se.svg','SWE'),
('Grupo G',225,'Bélgica','https://flagicons.lipis.dev/flags/4x3/be.svg','BEL'),
('Grupo G',226,'Irán','https://flagicons.lipis.dev/flags/4x3/ir.svg','IRN'),
('Grupo G',227,'Egipto','https://flagicons.lipis.dev/flags/4x3/eg.svg','EGY'),
('Grupo G',228,'Nueva Zelanda','https://flagicons.lipis.dev/flags/4x3/nz.svg','NZL'),
('Grupo H',229,'España','https://flagicons.lipis.dev/flags/4x3/es.svg','ESP'),
('Grupo H',230,'Uruguay','https://flagicons.lipis.dev/flags/4x3/uy.svg','URU'),
('Grupo H',231,'Arabia Saudita','https://flagicons.lipis.dev/flags/4x3/sa.svg','KSA'),
('Grupo H',232,'Cabo Verde','https://flagicons.lipis.dev/flags/4x3/cv.svg','CPV'),
('Grupo I',233,'Francia','https://flagicons.lipis.dev/flags/4x3/fr.svg','FRA'),
('Grupo I',234,'Senegal','https://flagicons.lipis.dev/flags/4x3/sn.svg','SEN'),
('Grupo I',235,'Noruega','https://flagicons.lipis.dev/flags/4x3/no.svg','NOR'),
('Grupo I',236,'Iraq','https://flagicons.lipis.dev/flags/4x3/iq.svg','IRQ'),
('Grupo J',237,'Argentina','https://flagicons.lipis.dev/flags/4x3/ar.svg','ARG'),
('Grupo J',238,'Austria','https://flagicons.lipis.dev/flags/4x3/at.svg','AUT'),
('Grupo J',239,'Argelia','https://flagicons.lipis.dev/flags/4x3/dz.svg','ALG'),
('Grupo J',240,'Jordania','https://flagicons.lipis.dev/flags/4x3/jo.svg','JOR'),
('Grupo K',241,'Portugal','https://flagicons.lipis.dev/flags/4x3/pt.svg','POR'),
('Grupo K',242,'Colombia','https://flagicons.lipis.dev/flags/4x3/co.svg','COL'),
('Grupo K',243,'Uzbekistán','https://flagicons.lipis.dev/flags/4x3/uz.svg','UZB'),
('Grupo K',244,'RD Congo','https://flagicons.lipis.dev/flags/4x3/cd.svg','COD'),
('Grupo L',245,'Inglaterra','https://flagicons.lipis.dev/flags/4x3/gb-eng.svg','ENG'),
('Grupo L',246,'Croacia','https://flagicons.lipis.dev/flags/4x3/hr.svg','CRO'),
('Grupo L',247,'Panamá','https://flagicons.lipis.dev/flags/4x3/pa.svg','PAN'),
('Grupo L',248,'Ghana','https://flagicons.lipis.dev/flags/4x3/gh.svg','GHA')
ON CONFLICT (group_name, team_id) DO NOTHING;

-- ================================================================
-- FIN — Todos los cambios son idempotentes (re-ejecutar es seguro)
-- ================================================================
