import { hasStaffScope, profileRole, staffPathAllowed, workHome } from './access'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
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

  if (hasStaffScope(user) && location.pathname === '/' && workHome(user) !== '/') return <Navigate to={workHome(user)} replace />
  if (!staffPathAllowed(user, location.pathname)) return <main className="operation-page"><h1>Acesso restrito</h1><p role="alert">Esta área não está liberada para seu tipo de acesso.</p><Link to={workHome(user)}>Voltar ao início</Link></main>

  return <Outlet />
}
