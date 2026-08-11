import * as React from 'react'
import { isBannerCover } from '@/lib/gameArt'
import type { Game } from '@/lib/types'

interface GameCoverProps {
  game: Pick<Game, 'platform' | 'icon_url'>
  className?: string
}

export function GameCover({ game, className }: GameCoverProps) {
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => setFailed(false), [game.icon_url])

  if (!game.icon_url || failed) return null

  if (!isBannerCover(game)) {
    return (
      <div className={`flex items-center justify-center ${className ?? ''}`}>
        <img
          src={game.icon_url}
          alt=""
          loading="lazy"
          className="h-12 w-12 rounded-md object-cover"
          onError={() => setFailed(true)}
        />
      </div>
    )
  }

  return (
    <img
      src={game.icon_url}
      alt=""
      loading="lazy"
      className={className}
      onError={() => setFailed(true)}
    />
  )
}
