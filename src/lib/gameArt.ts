import type { Game } from '@/lib/types'

// A capa salva no banco pra jogos da Steam vem do ícone de biblioteca do
// usuário (img_icon_url), que é minúsculo (32x32) e fica com qualidade ruim
// em qualquer tamanho de card. A Steam serve a arte de loja de cada jogo por
// uma URL previsível a partir do appid, então montamos ela na hora em vez de
// depender do que foi salvo na sincronização.
export function getGameCoverUrl(game: Pick<Game, 'platform' | 'external_id' | 'icon_url'>): string | null {
  if (game.platform === 'steam') {
    return `https://cdn.akamai.steamstatic.com/steam/apps/${game.external_id}/header.jpg`
  }
  return game.icon_url
}
