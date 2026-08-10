import * as React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function Login() {
  const { user, signIn, signUp } = useAuth()
  const [mode, setMode] = React.useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [username, setUsername] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  if (user) return <Navigate to="/" replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const result =
      mode === 'signin' ? await signIn(email, password) : await signUp(email, password, username)

    setSubmitting(false)
    if (result.error) setError(result.error)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent">
            <div className="h-3.5 w-3.5 rotate-45 rounded-[2px] bg-accent-foreground" />
          </div>
          <span className="font-display text-xl font-semibold text-text">Platina</span>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6">
          <h1 className="font-display mb-1 text-lg font-medium text-text">
            {mode === 'signin' ? 'Entrar' : 'Criar conta'}
          </h1>
          <p className="mb-6 text-sm text-text-secondary">
            {mode === 'signin'
              ? 'Acesse sua conta para ver seus jogos e troféus.'
              : 'Leva menos de um minuto.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div className="space-y-1.5">
                <Label htmlFor="username">Nome de usuário</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="seu_nick"
                  required
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
                required
              />
            </div>

            {error && (
              <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? 'Aguarde…' : mode === 'signin' ? 'Entrar' : 'Criar conta'}
            </Button>
          </form>
        </div>

        <button
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          className="mt-4 w-full text-center text-sm text-text-secondary hover:text-text"
        >
          {mode === 'signin' ? 'Não tem conta? Criar uma' : 'Já tem conta? Entrar'}
        </button>
      </div>
    </div>
  )
}
