import * as React from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLanguage } from '@/i18n/LanguageContext'
import { supabase } from '@/lib/supabase'
import { GameCover } from '@/components/GameCover'
import type { Game, Trophy, TrophyType } from '@/lib/types'

type TrophyRow = Trophy & { earned: boolean; earned_at: string | null }
type Filter = 'todas' | 'concluidas' | 'pendentes'

const TIER_COLOR: Record<TrophyType, string> = {
  bronze: 'bg-bronze',
  silver: 'bg-silver',
  gold: 'bg-gold',
  platinum: 'bg-platinum',
  achievement: 'bg-accent',
}

export default function GameDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { t, locale } = useLanguage()
  const [game, setGame] = React.useState<Game | null>(null)
  const [trophies, setTrophies] = React.useState<TrophyRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [filter, setFilter] = React.useState<Filter>('todas')

  React.useEffect(() => {
    if (!id || !user) return
    const gameId = id
    const userId = user.id

    async function load() {
      const [{ data: gameData }, { data: trophyData }, { data: earnedData }] = await Promise.all([
        supabase.from('games').select('*').eq('id', gameId).single(),
        supabase.from('trophies').select('*').eq('game_id', gameId),
        supabase
          .from('user_trophies')
          .select('trophy_id, earned, earned_at, trophies!inner(game_id)')
          .eq('user_id', userId)
          .eq('trophies.game_id', gameId),
      ])

      const trophies = (trophyData ?? []) as unknown as Trophy[]
      const earned = (earnedData ?? []) as unknown as { trophy_id: string; earned: boolean; earned_at: string | null }[]
      const earnedMap = new Map(earned.map((r) => [r.trophy_id, r]))

      const merged: TrophyRow[] = trophies.map((t) => ({
        ...t,
        earned: earnedMap.get(t.id)?.earned ?? false,
        earned_at: earnedMap.get(t.id)?.earned_at ?? null,
      }))

      setGame(gameData as unknown as Game)
      setTrophies(merged)
      setLoading(false)
    }

    load()
  }, [id, user])

  const earnedCount = trophies.filter((t) => t.earned).length
  const filteredTrophies = trophies.filter((t) => {
    if (filter === 'concluidas') return t.earned
    if (filter === 'pendentes') return !t.earned
    return true
  })

  const FILTER_LABEL: Record<Filter, string> = {
    todas: t('gameDetail.filterAll'),
    concluidas: t('gameDetail.filterDone'),
    pendentes: t('gameDetail.filterPending'),
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="h-6 w-40 animate-pulse rounded bg-surface" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text">
        <ArrowLeft className="h-4 w-4" />
        {t('gameDetail.backLink')}
      </Link>

      {game && (
        <div className="mb-4 aspect-[460/215] w-full overflow-hidden rounded-xl bg-surface">
          <GameCover game={game} className="h-full w-full object-cover" />
        </div>
      )}
      <h1 className="font-display mb-6 text-xl font-medium text-text">
        {game?.name ?? t('gameDetail.fallbackTitle')}
      </h1>

      {trophies.length > 0 && (
        <>
          <p className="mb-4 text-sm text-text-secondary">
            {t('gameDetail.summary', {
              total: trophies.length,
              earned: earnedCount,
              missing: trophies.length - earnedCount,
            })}
          </p>

          <div className="mb-6 flex gap-2">
            {(['todas', 'concluidas', 'pendentes'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg px-3.5 py-1.5 text-sm transition-colors ${
                  filter === f ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-surface'
                }`}
              >
                {FILTER_LABEL[f]}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="space-y-2">
        {filteredTrophies.map((trophy) => {
          const displayName = locale === 'pt' ? trophy.name_pt || trophy.name : trophy.name
          const displayDescription =
            locale === 'pt' ? trophy.description_pt || trophy.description : trophy.description

          return (
            <div
              key={trophy.id}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
                trophy.earned
                  ? 'border-success/30 bg-success/5'
                  : 'border-border bg-surface opacity-50'
              }`}
            >
              {trophy.icon_url ? (
                <img
                  src={trophy.icon_url}
                  alt=""
                  className={`h-10 w-10 shrink-0 rounded-md object-cover ${trophy.earned ? '' : 'grayscale'}`}
                />
              ) : (
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TIER_COLOR[trophy.type]}`} />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text">{displayName}</p>
                {displayDescription && (
                  <p className="truncate text-xs text-text-secondary">{displayDescription}</p>
                )}
              </div>
              {trophy.earned && <Check className="h-4 w-4 shrink-0 text-success" />}
            </div>
          )
        })}

        {trophies.length === 0 && (
          <p className="py-8 text-center text-sm text-text-secondary">{t('gameDetail.emptyTrophies')}</p>
        )}

        {trophies.length > 0 && filteredTrophies.length === 0 && (
          <p className="py-8 text-center text-sm text-text-secondary">
            {filter === 'concluidas' ? t('gameDetail.emptyFilterDone') : t('gameDetail.emptyFilterPending')}
          </p>
        )}
      </div>
    </div>
  )
}
