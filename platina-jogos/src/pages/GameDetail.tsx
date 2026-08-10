import * as React from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { Game, Trophy, TrophyType } from '@/lib/types'

type TrophyRow = Trophy & { earned: boolean; earned_at: string | null }

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
  const [game, setGame] = React.useState<Game | null>(null)
  const [trophies, setTrophies] = React.useState<TrophyRow[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (!id || !user) return
    const gameId = id
    const userId = user.id

    async function load() {
      const [{ data: gameData }, { data: trophyData }, { data: earnedData }] = await Promise.all([
        supabase.from('games').select('*').eq('id', gameId).single(),
        supabase.from('trophies').select('*').eq('game_id', gameId),
        supabase.from('user_trophies').select('trophy_id, earned, earned_at').eq('user_id', userId),
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
        Meus jogos
      </Link>

      <h1 className="font-display mb-6 text-xl font-medium text-text">{game?.name ?? 'Jogo'}</h1>

      <div className="space-y-2">
        {trophies.map((trophy) => (
          <div
            key={trophy.id}
            className={`flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 ${
              trophy.earned ? '' : 'opacity-50'
            }`}
          >
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TIER_COLOR[trophy.type]}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-text">{trophy.hidden && !trophy.earned ? '???' : trophy.name}</p>
              {trophy.description && !(trophy.hidden && !trophy.earned) && (
                <p className="truncate text-xs text-text-secondary">{trophy.description}</p>
              )}
            </div>
          </div>
        ))}

        {trophies.length === 0 && (
          <p className="py-8 text-center text-sm text-text-secondary">
            Nenhum troféu sincronizado para este jogo ainda.
          </p>
        )}
      </div>
    </div>
  )
}
