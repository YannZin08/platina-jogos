import * as React from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, Check, Settings as SettingsIcon, Search, Star } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLanguage } from '@/i18n/LanguageContext'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GameCover } from '@/components/GameCover'
import { formatPlaytime } from '@/lib/utils'
import type { Game, GameWithProgress } from '@/lib/types'

type Filter = 'todos' | 'platinados' | 'pendentes'
type PlatformFilter = 'todas' | 'psn' | 'steam'
type Sort = 'recent' | 'progress' | 'playtime' | null

export default function Dashboard() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const [games, setGames] = React.useState<GameWithProgress[]>([])
  const [loading, setLoading] = React.useState(true)
  const [syncing, setSyncing] = React.useState(false)
  const [filter, setFilter] = React.useState<Filter>('todos')
  const [platformFilter, setPlatformFilter] = React.useState<PlatformFilter>('todas')
  const [sort, setSort] = React.useState<Sort>(null)
  const [search, setSearch] = React.useState('')

  const loadGames = React.useCallback(
    async (showLoading = true) => {
      if (!user) return
      if (showLoading) setLoading(true)

      const { data } = await supabase
        .from('user_games')
        .select('progress_pct, platinated, favorite, playtime_minutes, last_synced_at, games(*)')
        .eq('user_id', user.id)

      type Row = {
        progress_pct: number
        platinated: boolean
        favorite: boolean
        playtime_minutes: number | null
        last_synced_at: string | null
        games: Game | null
      }
      const rows = (data ?? []) as unknown as Row[]

      const mapped: GameWithProgress[] = rows
        .filter((row) => row.games)
        .map((row) => ({
          ...(row.games as Game),
          progress_pct: row.progress_pct,
          platinated: row.platinated,
          favorite: row.favorite,
          playtime_minutes: row.playtime_minutes,
          last_synced_at: row.last_synced_at,
        }))

      setGames(mapped)
      if (showLoading) setLoading(false)
    },
    [user],
  )

  const syncNow = React.useCallback(async () => {
    setSyncing(true)
    // Conta não conectada ou function fora do ar não deve travar a tela;
    // é uma sincronização silenciosa em segundo plano.
    await Promise.allSettled([
      supabase.functions.invoke('steam-sync'),
      supabase.functions.invoke('psn-sync'),
    ])
    await loadGames(false)
    setSyncing(false)
  }, [loadGames])

  React.useEffect(() => {
    loadGames().then(() => syncNow())
  }, [loadGames, syncNow])

  async function toggleFavorite(e: React.MouseEvent, gameId: string, current: boolean) {
    e.preventDefault()
    e.stopPropagation()
    if (!user) return
    setGames((prev) => prev.map((g) => (g.id === gameId ? { ...g, favorite: !current } : g)))
    await supabase
      .from('user_games')
      .update({ favorite: !current })
      .eq('user_id', user.id)
      .eq('game_id', gameId)
  }

  const platinatedCount = games.filter((g) => g.platinated).length
  const hasPsn = games.some((g) => g.platform === 'psn')
  const hasSteam = games.some((g) => g.platform === 'steam')

  const visible = games
    .filter((g) => {
      if (filter === 'platinados') return g.platinated
      if (filter === 'pendentes') return !g.platinated
      return true
    })
    .filter((g) => platformFilter === 'todas' || g.platform === platformFilter)
    .filter((g) => g.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
      if (sort === 'progress') {
        const diff = b.progress_pct - a.progress_pct
        if (diff !== 0) return diff
      } else if (sort === 'recent') {
        const diff = (b.last_synced_at ?? '').localeCompare(a.last_synced_at ?? '')
        if (diff !== 0) return diff
      } else if (sort === 'playtime') {
        const diff = (b.playtime_minutes ?? 0) - (a.playtime_minutes ?? 0)
        if (diff !== 0) return diff
      }
      // Ordem alfabética sempre como base/critério de desempate.
      return a.name.localeCompare(b.name)
    })

  const FILTER_LABEL: Record<Filter, string> = {
    todos: t('dashboard.filterAll'),
    platinados: t('dashboard.filterPlatinated'),
    pendentes: t('dashboard.filterPending'),
  }

  const PLATFORM_LABEL: Record<PlatformFilter, string> = {
    todas: t('dashboard.platformAll'),
    psn: 'PSN',
    steam: 'Steam',
  }

  const SORT_LABEL: Record<Exclude<Sort, null>, string> = {
    recent: t('dashboard.sortRecent'),
    progress: t('dashboard.sortProgress'),
    playtime: t('dashboard.sortPlaytime'),
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-lg font-medium text-text">{t('dashboard.title')}</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {games.length > 0
              ? t('dashboard.summary', { platinated: platinatedCount, total: games.length })
              : t('dashboard.emptySummary')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={syncNow} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? t('dashboard.syncing') : t('dashboard.update')}
          </Button>
          <Link to="/settings">
            <Button variant="ghost" size="sm">
              <SettingsIcon className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {games.length > 0 && (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('dashboard.searchPlaceholder')}
                className="pl-9"
              />
            </div>

            <div className="flex gap-2">
              {(['recent', 'progress', 'playtime'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSort(sort === s ? null : s)}
                  className={`rounded-lg px-3.5 py-1.5 text-sm transition-colors ${
                    sort === s ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-surface'
                  }`}
                >
                  {SORT_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              {(['todos', 'platinados', 'pendentes'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-lg px-3.5 py-1.5 text-sm transition-colors ${
                    filter === f
                      ? 'bg-accent/15 text-accent'
                      : 'text-text-secondary hover:bg-surface'
                  }`}
                >
                  {FILTER_LABEL[f]}
                </button>
              ))}
            </div>

            {hasPsn && hasSteam && (
              <div className="flex gap-2">
                {(['todas', 'psn', 'steam'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlatformFilter(p)}
                    className={`rounded-lg px-3.5 py-1.5 text-sm transition-colors ${
                      platformFilter === p
                        ? 'bg-accent/15 text-accent'
                        : 'text-text-secondary hover:bg-surface'
                    }`}
                  >
                    {PLATFORM_LABEL[p]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-surface" />
          ))}
        </div>
      ) : games.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <p className="mb-1 text-text">{t('dashboard.emptyTitle')}</p>
          <p className="mb-5 text-sm text-text-secondary">{t('dashboard.emptyDescription')}</p>
          <Link to="/settings">
            <Button>{t('dashboard.goToSettings')}</Button>
          </Link>
        </div>
      ) : visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-text-secondary">
          {t('dashboard.noResults', { query: search })}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((game) => (
            <Link
              key={game.id}
              to={`/games/${game.id}`}
              className="relative overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-border-strong"
            >
              <button
                onClick={(e) => toggleFavorite(e, game.id, game.favorite)}
                aria-label={game.favorite ? t('dashboard.favoriteRemove') : t('dashboard.favoriteAdd')}
                className="absolute right-3 top-3 z-10 text-text-secondary hover:text-gold"
              >
                <Star className={`h-4 w-4 ${game.favorite ? 'fill-gold text-gold' : ''}`} />
              </button>

              <div className="aspect-[460/215] w-full bg-bg">
                <GameCover game={game} className="h-full w-full object-cover" />
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

                <div className="flex items-center justify-between gap-2">
                  {game.platinated ? (
                    <div className="flex items-center gap-1 text-xs font-medium text-success">
                      <Check className="h-3.5 w-3.5" />
                      {game.platform === 'psn'
                        ? t('dashboard.platinatedBadgePsn')
                        : t('dashboard.platinatedBadgeSteam')}
                    </div>
                  ) : (
                    <div className="text-xs text-text-secondary">
                      {game.platform === 'psn'
                        ? t('dashboard.progressPsn', { pct: Math.round(game.progress_pct) })
                        : t('dashboard.progressSteam', { pct: Math.round(game.progress_pct) })}
                    </div>
                  )}

                  {game.playtime_minutes != null && game.playtime_minutes > 0 && (
                    <span className="shrink-0 text-xs text-text-secondary">
                      {t('dashboard.playtime', { duration: formatPlaytime(game.playtime_minutes) })}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
