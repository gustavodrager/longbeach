import { profileRole } from './access'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './authContext'

export function AuthGuard() {
  const { user, isBootstrapping } = useAuth()
  const location = useLocation()

  if (isBootstrapping) {
    return (
      <main className="session-loading" aria-live="polite">
        <span className="loading-mark" aria-hidden="true" />
        <span>Carregando sua área…</span>
      </main>
    )
  }

  if (!user) {
    return <Navigate to={location.pathname === '/' ? '/visitante' : '/login'} replace state={{ from: location }} />
  }

  if (user.requiresFirstAccess) return <Navigate to="/primeiro-acesso" replace />

  if (!profileRole(user)) return <main className="operation-page"><h1>Acesso restrito</h1><p role="alert">Sua conta precisa ter um único perfil válido. Peça à gestão para conferir seu acesso.</p></main>

  return <Outlet />
}
