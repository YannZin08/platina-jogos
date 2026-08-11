export type Platform = 'psn' | 'steam'
export type TrophyType = 'bronze' | 'silver' | 'gold' | 'platinum' | 'achievement'

export interface Profile {
  id: string
  username: string
  avatar_url: string | null
  created_at: string
}

export interface Game {
  id: string
  platform: Platform
  external_id: string
  name: string
  icon_url: string | null
  has_platinum: boolean
}

export interface Trophy {
  id: string
  game_id: string
  external_trophy_id: string
  name: string
  description: string | null
  name_pt: string | null
  description_pt: string | null
  icon_url: string | null
  type: TrophyType
  hidden: boolean
}

export interface UserGame {
  user_id: string
  game_id: string
  progress_pct: number
  platinated: boolean
  favorite: boolean
  playtime_minutes: number | null
  last_synced_at: string | null
}

export interface UserTrophy {
  user_id: string
  trophy_id: string
  earned: boolean
  earned_at: string | null
}

// Jogo já combinado com o progresso do usuário, como usado no dashboard
export type GameWithProgress = Game & {
  progress_pct: number
  platinated: boolean
  favorite: boolean
  playtime_minutes: number | null
  last_synced_at: string | null
}
