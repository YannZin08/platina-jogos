import * as React from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLanguage } from '@/i18n/LanguageContext'
import { supabase } from '@/lib/supabase'
import { Avatar } from '@/components/Avatar'

export function AppHeader() {
  const { user, signOut } = useAuth()
  const { t } = useLanguage()
  const [profile, setProfile] = React.useState<{ username: string | null; avatar_url: string | null }>({
    username: null,
    avatar_url: null,
  })

  React.useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('username, avatar_url')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setProfile(data)
      })
  }, [user])

  return (
    <header className="border-b border-border bg-surface/50">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <NavLink to="/" className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="h-7 w-7" />
          <span className="font-display text-sm font-semibold text-text">Platina</span>
        </NavLink>

        <nav className="flex items-center gap-1 text-sm">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `rounded-lg px-3 py-1.5 transition-colors ${
                isActive ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:text-text'
              }`
            }
          >
            {t('dashboard.title')}
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-lg px-3 py-1.5 transition-colors ${
                isActive ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:text-text'
              }`
            }
          >
            <Avatar url={profile.avatar_url} label={profile.username || user?.email || '?'} className="h-5 w-5 text-[10px]" />
            {t('settings.title')}
          </NavLink>
          <button
            onClick={signOut}
            className="ml-1 rounded-lg px-3 py-1.5 text-text-secondary transition-colors hover:text-text"
          >
            {t('settings.signOut')}
          </button>
        </nav>
      </div>
    </header>
  )
}
