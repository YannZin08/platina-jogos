import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { AppHeader } from '@/components/AppHeader'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return (
    <>
      <AppHeader />
      {children}
    </>
  )
}
