import * as React from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ResetPassword() {
  const { user, loading, updatePassword } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  if (!loading && !user) return <Navigate to="/login" replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('As senhas não conferem.')
      return
    }

    setSubmitting(true)
    const result = await updatePassword(password)
    setSubmitting(false)

    if (result.error) setError(result.error)
    else navigate('/', { replace: true })
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
          <h1 className="font-display mb-1 text-lg font-medium text-text">Nova senha</h1>
          <p className="mb-6 text-sm text-text-secondary">Escolha uma nova senha para sua conta.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">Nova senha</Label>
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

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirmar senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
              {submitting ? 'Salvando…' : 'Salvar nova senha'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
