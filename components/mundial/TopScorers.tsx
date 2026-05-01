export interface TopScorer {
  playerId: number
  playerName: string
  playerPhoto: string | null
  teamName: string
  teamFlag: string | null
  goals: number
  assists: number
}

interface Props {
  topScorers: TopScorer[]
}

function Medal({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-base">🥇</span>
  if (rank === 2) return <span className="text-base">🥈</span>
  if (rank === 3) return <span className="text-base">🥉</span>
  return (
    <span className="text-xs font-black w-5 text-center" style={{ color: "#6b7280" }}>
      {rank}
    </span>
  )
}

export default function TopScorers({ topScorers }: Props) {
  if (topScorers.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">⚽</div>
        <p className="font-bold mb-1" style={{ color: "#111827" }}>
          Aún no hay goleadores
        </p>
        <p className="text-sm" style={{ color: "#6b7280" }}>
          Los goleadores aparecerán cuando el torneo comience.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 max-w-xl mx-auto">
      {topScorers.map((player, i) => (
        <div
          key={player.playerId}
          className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{
            background: "white",
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          {/* Rank */}
          <div className="w-6 flex justify-center flex-shrink-0">
            <Medal rank={i + 1} />
          </div>

          {/* Player photo */}
          {player.playerPhoto ? (
            <img
              src={player.playerPhoto}
              alt={player.playerName}
              className="w-10 h-10 rounded-full object-cover flex-shrink-0"
              style={{ border: "2px solid #f3f4f6" }}
            />
          ) : (
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-lg font-black"
              style={{ background: "#f3f4f6", color: "#9ca3af" }}
            >
              {player.playerName.charAt(0)}
            </div>
          )}

          {/* Player info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate" style={{ color: "#111827" }}>
              {player.playerName}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {player.teamFlag && (
                <img
                  src={player.teamFlag}
                  alt={player.teamName}
                  className="w-4 h-3 object-contain flex-shrink-0 rounded-sm"
                />
              )}
              <span className="text-xs truncate" style={{ color: "#6b7280" }}>
                {player.teamName}
              </span>
            </div>
          </div>

          {/* Goals */}
          <div className="flex flex-col items-center flex-shrink-0">
            <span
              className="text-xl font-black leading-none"
              style={{ color: "#111827" }}
            >
              {player.goals}
            </span>
            <span className="text-[10px] font-medium mt-0.5" style={{ color: "#9ca3af" }}>
              goles
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
