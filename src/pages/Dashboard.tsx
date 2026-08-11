import * as React from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, Check } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { getGameCoverUrl } from '@/lib/gameArt'
import type { Game, GameWithProgress } from '@/lib/types'

type Filter = 'todos' | 'platinados' | 'pendentes'

export default function Dashboard() {
  const { user } = useAuth()
  const [games, setGames] = React.useState<GameWithProgress[]>([])
  const [loading, setLoading] = React.useState(true)
  const [filter, setFilter] = React.useState<Filter>('todos')

  const loadGames = React.useCallback(async () => {
    if (!user) return
    setLoading(true)

    const { data } = await supabase
      .from('user_games')
      .select('progress_pct, platinated, games(*)')
      .eq('user_id', user.id)

    type Row = { progress_pct: number; platinated: boolean; games: Game | null }
    const rows = (data ?? []) as unknown as Row[]

    const mapped: GameWithProgress[] = rows
      .filter((row) => row.games)
      .map((row) => ({
        ...(row.games as Game),
        progress_pct: row.progress_pct,
        platinated: row.platinated,
      }))

    setGames(mapped)
    setLoading(false)
  }, [user])

  React.useEffect(() => {
    loadGames()
  }, [loadGames])

  const filtered = games.filter((g) => {
    if (filter === 'platinados') return g.platinated
    if (filter === 'pendentes') return !g.platinated
    return true
  })

  const platinatedCount = games.filter((g) => g.platinated).length

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-lg font-medium text-text">Meus jogos</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {games.length > 0
              ? `${platinatedCount} platinados de ${games.length}`
              : 'Conecte uma conta para começar'}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={loadGames}>
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {games.length > 0 && (
        <div className="mb-6 flex gap-2">
          {(['todos', 'platinados', 'pendentes'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3.5 py-1.5 text-sm capitalize transition-colors ${
                filter === f
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-secondary hover:bg-surface'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-surface" />
          ))}
        </div>
      ) : games.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <p className="mb-1 text-text">Nenhum jogo ainda</p>
          <p className="mb-5 text-sm text-text-secondary">
            Conecte sua conta PSN ou Steam nas configurações para importar seus troféus.
          </p>
          <Link to="/settings">
            <Button>Ir para configurações</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((game) => (
            <Link
              key={game.id}
              to={`/games/${game.id}`}
              className="overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-border-strong"
            >
              <div className="aspect-[460/215] w-full bg-bg">
                {getGameCoverUrl(game) && (
                  <img
                    src={getGameCoverUrl(game)!}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
              </div>

              <div className="p-4">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-text">{game.name}</span>
                  <span className="shrink-0 rounded-md bg-bg px-2 py-0.5 text-[11px] text-text-secondary">
                    {game.platform === 'psn' ? 'PSN' : 'Steam'}
                  </span>
                </div>

                <div className="mb-2.5 h-1.5 overflow-hidden rounded-full bg-bg">
                  <div
                    className={`h-full rounded-full ${game.platinated ? 'bg-success' : 'bg-accent'}`}
                    style={{ width: `${Math.round(game.progress_pct)}%` }}
                  />
                </div>

                {game.platinated ? (
                  <div className="flex items-center gap-1 text-xs font-medium text-success">
                    <Check className="h-3.5 w-3.5" />
                    {game.platform === 'psn' ? 'Platinado' : '100% completo'}
                  </div>
                ) : (
                  <div className="text-xs text-text-secondary">
                    {Math.round(game.progress_pct)}%{' '}
                    {game.platform === 'psn' ? 'dos troféus' : 'das conquistas'}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
