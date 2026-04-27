export type Phase = 'groups' | 'round_of_32' | 'round_of_16' | 'quarterfinals' | 'semifinals' | 'final'

export interface Profile {
  id: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  created_at: string
}

export interface Fixture {
  id: number               // = api_fixture_id (mismo valor, usado como PK)
  league_id: number
  season: number
  round: string | null
  phase: Phase | null
  group_name: string | null

  // Programación  (kickoff = kickoff_at en la nomenclatura del usuario)
  kickoff: string | null

  // Estado del partido
  status: string           // valor interno: "not_started" | "live" | "finished" | …
  status_short: string | null  // código crudo de API: "NS", "FT", "1H", etc.
  status_long: string | null   // texto legible: "Not Started", "Full Time", etc.
  elapsed: number | null       // minutos jugados; null si no empezó

  // Venue
  venue_name: string | null
  venue_city: string | null

  // Equipos (denormalizados para consultas rápidas)
  home_team_id: number | null
  home_team_name: string | null
  home_team_code: string | null
  home_team_flag: string | null
  away_team_id: number | null
  away_team_name: string | null
  away_team_code: string | null
  away_team_flag: string | null

  // Resultado  (home_score = home_goals; penalty_home = home_penalty_goals)
  home_score: number | null
  away_score: number | null
  penalty_home: number | null
  penalty_away: number | null
  went_to_penalties: boolean
  penalties_winner: string | null

  // Bracket (posiciones en eliminatoria y placeholders para equipos TBD)
  bracket_position: string | null
  home_placeholder: string | null
  away_placeholder: string | null

  // Metadatos de sync
  api_updated_at: string | null  // cuándo actualizó la API este fixture
  updated_at?: string
  created_at?: string

  // Origen del resultado: null = sin resultado, 'api' = live/API, 'manual' = admin, 'simulation' = prueba
  result_source: 'api' | 'manual' | 'simulation' | null
}

export interface Pool {
  id: string
  name: string
  description: string | null
  price_per_quiniela: number
  currency: string
  created_by: string | null
  is_active: boolean
  created_at: string
}

export interface PoolMember {
  id: string
  pool_id: string
  user_id: string
  role: 'admin' | 'member'
  joined_at: string
}

export interface Quiniela {
  id: string
  user_id: string
  pool_id: string | null
  name: string
  status: 'draft' | 'submitted'
  submitted_at: string | null
  top_scorer_pick: string | null
  top_scorer_player_id: number | null
  most_goals_team_pick: string | null
  most_goals_team_id: number | null
  top_scorer_points: number
  most_goals_team_points: number
  champion_team_name: string | null
  champion_team_flag: string | null
  total_points: number
  exact_results: number
  correct_winners: number
  is_test?: boolean
  created_at: string
  updated_at: string
  profiles?: Profile
  pools?: Pool
}

export interface Prediction {
  id: string
  quiniela_id: string
  fixture_id: number
  home_score_pred: number | null
  away_score_pred: number | null
  predicts_penalties: boolean
  penalties_winner: string | null
  points_earned: number
  created_at: string
  updated_at: string
  fixtures?: Fixture
}

/** Pick for a knockout bracket slot — independent of fixture IDs. */
export interface BracketPick {
  id: string
  quiniela_id: string
  slot_key: string    // "R32-01", "R16-01", "QF-01", "SF-01", "3P", "FIN", etc.
  home_score_pred: number | null
  away_score_pred: number | null
  predicts_penalties: boolean
  penalties_winner: string | null
  points_earned: number
  created_at: string
  updated_at: string
}

export interface GroupStanding {
  id: string
  group_name: string
  team_id: number
  team_name: string
  team_flag: string | null
  team_code: string | null
  played: number
  won: number
  drawn: number
  lost: number
  goals_for: number
  goals_against: number
  goal_difference: number
  points: number
}

export const PHASE_MULTIPLIER: Record<Phase, number> = {
  groups: 1,
  round_of_32: 2,
  round_of_16: 3,
  quarterfinals: 4,
  semifinals: 5,
  final: 6,
}

export const PHASE_LABELS: Record<Phase, string> = {
  groups: 'Fase de Grupos',
  round_of_32: 'Ronda de 32',
  round_of_16: 'Octavos de Final',
  quarterfinals: 'Cuartos de Final',
  semifinals: 'Semifinales',
  final: 'Final',
}

export const BONUS_POINTS = {
  top_scorer: 20,
  most_goals_team: 15,
  penalty_correct: 3,
  penalty_winner: 5,
}
