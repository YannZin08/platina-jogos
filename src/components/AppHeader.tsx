import { NavLink } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export function AppHeader() {
  const { signOut } = useAuth()

  return (
    <header className="border-b border-border bg-surface/50">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <NavLink to="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent">
            <div className="h-2.5 w-2.5 rotate-45 rounded-[1px] bg-accent-foreground" />
          </div>
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
            Meus jogos
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `rounded-lg px-3 py-1.5 transition-colors ${
                isActive ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:text-text'
              }`
            }
          >
            Configurações
          </NavLink>
          <button
            onClick={signOut}
            className="ml-1 rounded-lg px-3 py-1.5 text-text-secondary transition-colors hover:text-text"
          >
            Sair
          </button>
        </nav>
      </div>
    </header>
  )
}
