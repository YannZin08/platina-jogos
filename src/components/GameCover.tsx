import * as React from 'react'
import { getGameCoverUrl } from '@/lib/gameArt'
import type { Game } from '@/lib/types'

interface GameCoverProps {
  game: Pick<Game, 'platform' | 'external_id' | 'icon_url'>
  className?: string
}

// Jogos mais novos na Steam nem sempre têm o banner de loja nesse endereço
// previsível (o esquema de assets mudou pra alguns títulos recentes). Se o
// banner falhar, cai pro ícone salvo na sincronização; se esse também não
// existir/falhar, não renderiza nada e o fundo do card aparece no lugar.
export function GameCover({ game, className }: GameCoverProps) {
  const primary = getGameCoverUrl(game)
  const fallback = game.icon_url
  const initialStage = primary ? 'primary' : fallback ? 'fallback' : 'none'
  const [stage, setStage] = React.useState<'primary' | 'fallback' | 'none'>(initialStage)

  React.useEffect(() => {
    setStage(primary ? 'primary' : fallback ? 'fallback' : 'none')
  }, [primary, fallback])

  if (stage === 'none') return null

  // O ícone de fallback é pequeno (salvo em baixa resolução na sincronização);
  // esticar ele pra preencher o banner inteiro (object-cover) deixa borrado,
  // então aqui ele fica no tamanho original, centralizado no espaço do banner.
  if (stage === 'fallback') {
    return (
      <div className={`flex items-center justify-center ${className ?? ''}`}>
        <img
          src={fallback!}
          alt=""
          loading="lazy"
          className="h-12 w-12 rounded-md object-cover"
          onError={() => setStage('none')}
        />
      </div>
    )
  }

  return (
    <img
      src={primary!}
      alt=""
      loading="lazy"
      className={className}
      onError={() => setStage(fallback ? 'fallback' : 'none')}
    />
  )
}
