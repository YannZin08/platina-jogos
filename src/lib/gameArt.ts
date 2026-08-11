import type { Game } from '@/lib/types'

// steam-sync baixa e valida a capa no servidor antes de salvar, então um
// icon_url vindo do bucket "game-covers" é sempre um banner em boa
// resolução. Se não vier de lá (ícone pequeno salvo direto da Steam como
// último recurso, quando nenhum banner foi encontrado), é um ícone pequeno
// e esticar ele pra preencher o card inteiro fica borrado — por isso mantemos
// a distinção pra escolher como renderizar em cada card.
export function isBannerCover(game: Pick<Game, 'platform' | 'icon_url'>): boolean {
  if (game.platform === 'psn') return true
  return !!game.icon_url?.includes('/game-covers/')
}
