-- =================================================================
-- supabase-fix-v3.sql
-- Fixes bracket_position, home_placeholder, away_placeholder for all
-- knockout fixtures (IDs 1000073–1000104).
--
-- WHY: supabase-update-v2.sql used ON CONFLICT (id) DO NOTHING, so
-- if fixtures were already inserted without those columns, the
-- placeholders were never written. This script forces the update.
--
-- Also resets all knockout fixtures to not_started so you can
-- re-simulate a clean tournament.
--
-- SAFE TO RUN multiple times (all statements are idempotent).
-- =================================================================

-- 1. Ensure the phase CHECK constraint includes round_of_32
ALTER TABLE public.fixtures DROP CONSTRAINT IF EXISTS fixtures_phase_check;
ALTER TABLE public.fixtures ADD CONSTRAINT fixtures_phase_check
  CHECK (phase IN ('groups','round_of_32','round_of_16','quarterfinals','semifinals','final'));

-- 2. Ensure bracket columns exist (in case alter from v2 wasn't run)
ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS bracket_position text;
ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS home_placeholder  text;
ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS away_placeholder  text;

-- 3. Force-write bracket data for all 32 knockout fixtures
--    This overwrites whatever was there (including NULL from DO NOTHING)
UPDATE public.fixtures AS f
SET
  bracket_position  = v.bp,
  home_placeholder  = v.hp,
  away_placeholder  = v.ap,
  phase             = v.phase,
  round             = v.rnd,
  status            = 'not_started',
  home_team_id      = NULL, home_team_name = NULL,
  home_team_code    = NULL, home_team_flag = NULL,
  away_team_id      = NULL, away_team_name = NULL,
  away_team_code    = NULL, away_team_flag = NULL,
  home_score        = NULL, away_score     = NULL,
  went_to_penalties = false, penalties_winner = NULL
FROM (VALUES
  -- ── Ronda de 32 (IDs 1000073–1000088) ─────────────────────
  (1000073::int, 'round_of_32', 'Round of 32',     'R32-01', '1ro Grupo A',     '2do Grupo B'),
  (1000074::int, 'round_of_32', 'Round of 32',     'R32-02', '1ro Grupo C',     '2do Grupo F'),
  (1000075::int, 'round_of_32', 'Round of 32',     'R32-03', '1ro Grupo E',     'Mejor 3ro (A/B/C/D/F)'),
  (1000076::int, 'round_of_32', 'Round of 32',     'R32-04', '1ro Grupo F',     '2do Grupo C'),
  (1000077::int, 'round_of_32', 'Round of 32',     'R32-05', '2do Grupo E',     '2do Grupo I'),
  (1000078::int, 'round_of_32', 'Round of 32',     'R32-06', '1ro Grupo I',     'Mejor 3ro (C/D/F/G/H)'),
  (1000079::int, 'round_of_32', 'Round of 32',     'R32-07', '2do Grupo A',     'Mejor 3ro (C/E/F/H/I)'),
  (1000080::int, 'round_of_32', 'Round of 32',     'R32-08', '1ro Grupo L',     'Mejor 3ro (E/H/I/J/K)'),
  (1000081::int, 'round_of_32', 'Round of 32',     'R32-09', '1ro Grupo G',     'Mejor 3ro (A/E/H/I/J)'),
  (1000082::int, 'round_of_32', 'Round of 32',     'R32-10', '1ro Grupo D',     'Mejor 3ro (B/E/F/I/J)'),
  (1000083::int, 'round_of_32', 'Round of 32',     'R32-11', '1ro Grupo H',     '2do Grupo J'),
  (1000084::int, 'round_of_32', 'Round of 32',     'R32-12', '2do Grupo K',     '2do Grupo L'),
  (1000085::int, 'round_of_32', 'Round of 32',     'R32-13', '1ro Grupo B',     'Mejor 3ro (E/F/G/I/J)'),
  (1000086::int, 'round_of_32', 'Round of 32',     'R32-14', '2do Grupo D',     '2do Grupo G'),
  (1000087::int, 'round_of_32', 'Round of 32',     'R32-15', '1ro Grupo J',     '2do Grupo H'),
  (1000088::int, 'round_of_32', 'Round of 32',     'R32-16', '1ro Grupo K',     'Mejor 3ro (D/E/I/J/L)'),
  -- ── Octavos de Final (IDs 1000089–1000096) ─────────────────
  (1000089::int, 'round_of_16', 'Round of 16',     'R16-01', 'Ganador R32-01',  'Ganador R32-02'),
  (1000090::int, 'round_of_16', 'Round of 16',     'R16-02', 'Ganador R32-03',  'Ganador R32-04'),
  (1000091::int, 'round_of_16', 'Round of 16',     'R16-03', 'Ganador R32-05',  'Ganador R32-06'),
  (1000092::int, 'round_of_16', 'Round of 16',     'R16-04', 'Ganador R32-07',  'Ganador R32-08'),
  (1000093::int, 'round_of_16', 'Round of 16',     'R16-05', 'Ganador R32-09',  'Ganador R32-10'),
  (1000094::int, 'round_of_16', 'Round of 16',     'R16-06', 'Ganador R32-11',  'Ganador R32-12'),
  (1000095::int, 'round_of_16', 'Round of 16',     'R16-07', 'Ganador R32-13',  'Ganador R32-14'),
  (1000096::int, 'round_of_16', 'Round of 16',     'R16-08', 'Ganador R32-15',  'Ganador R32-16'),
  -- ── Cuartos de Final (IDs 1000097–1000100) ─────────────────
  (1000097::int, 'quarterfinals', 'Cuartos de Final', 'QF-01', 'Ganador R16-01', 'Ganador R16-02'),
  (1000098::int, 'quarterfinals', 'Cuartos de Final', 'QF-02', 'Ganador R16-03', 'Ganador R16-04'),
  (1000099::int, 'quarterfinals', 'Cuartos de Final', 'QF-03', 'Ganador R16-05', 'Ganador R16-06'),
  (1000100::int, 'quarterfinals', 'Cuartos de Final', 'QF-04', 'Ganador R16-07', 'Ganador R16-08'),
  -- ── Semifinales (IDs 1000101–1000102) ──────────────────────
  (1000101::int, 'semifinals',    'Semifinal',        'SF-01', 'Ganador QF-01',  'Ganador QF-02'),
  (1000102::int, 'semifinals',    'Semifinal',        'SF-02', 'Ganador QF-03',  'Ganador QF-04'),
  -- ── Tercer Lugar + Final (IDs 1000103–1000104) ─────────────
  (1000103::int, 'semifinals',    'Tercer Lugar',     '3P',    'Perdedor SF-01', 'Perdedor SF-02'),
  (1000104::int, 'final',         'Final',            'FIN',   'Ganador SF-01',  'Ganador SF-02')
) AS v(id, phase, rnd, bp, hp, ap)
WHERE f.id = v.id;

-- 4. Reset all GROUP fixtures to not_started (clean slate for simulation)
UPDATE public.fixtures
SET
  status            = 'not_started',
  home_score        = NULL,
  away_score        = NULL,
  went_to_penalties = false,
  penalties_winner  = NULL
WHERE phase = 'groups';

-- 5. Clear group standings (they'll rebuild when you simulate groups)
DELETE FROM public.groups;

-- =================================================================
-- VERIFY: Run this SELECT to confirm — should return exactly 32 rows
-- all with non-null bracket_position, home_placeholder, away_placeholder
-- =================================================================
SELECT
  id,
  phase,
  bracket_position,
  home_placeholder,
  away_placeholder,
  status
FROM public.fixtures
WHERE bracket_position IS NOT NULL
ORDER BY id;
