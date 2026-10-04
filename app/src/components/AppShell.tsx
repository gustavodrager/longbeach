import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../features/auth/authContext'
import { useOperations } from '../features/operations/DemoDataProvider'
import { Logo } from './Logo'

const navItems = [
  { label: 'Início', icon: '⌂', href: '/' },
  { label: 'Alunos', icon: '◎', href: '/alunos' },
  { label: 'Equipe', icon: '◇', href: '/equipe' },
  { label: 'Estoque', icon: '▦', href: '/estoque' },
  { label: 'Projetos', icon: '◫', href: '/projetos' },
]

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

export function AppShell({ demoMode = false }: { demoMode?: boolean }) {
  const { user, signOut } = useAuth()
  const { persistenceStatus, persistenceMessage } = useOperations()
  const visibleNavItems = [
    ...(!demoMode && user?.permissions.includes('bar:catalog:read') ? [...navItems, { label: 'Bar', icon: '▤', href: '/bar' }] : navItems),
    ...(!demoMode && user?.roles.includes('Owner') ? [{ label: 'Importações', icon: '⇧', href: '/importacoes' }] : []),
  ]
  const location = useLocation()
  const isActive = (href: string) => href === '/' ? location.pathname === '/' : location.pathname.startsWith(href)

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <Logo />
        <nav aria-label="Navegação principal">
          {visibleNavItems.map((item) => (
            <Link key={item.label} to={item.href} className={isActive(item.href) ? 'nav-item is-active' : 'nav-item'}>
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        {demoMode ? (
          <div className="demo-mode-indicator" role="note">Modo de teste<span>{persistenceStatus === 'connected' ? 'Dados fictícios · PostgreSQL conectado' : persistenceStatus === 'connecting' ? 'Conectando ao PostgreSQL…' : 'Dados fictícios · salvos neste navegador'}</span></div>
        ) : (
          <div className="side-account">
            <Link className="side-account-summary" to="/conta" aria-label="Abrir configurações da conta">
              <div className="avatar" aria-hidden="true">{initials(user?.name ?? 'LB')}</div>
              <div>
                <strong>{user?.name}</strong>
                <span>{user?.roles[0] ?? 'Equipe'}</span>
              </div>
            </Link>
            <button type="button" onClick={() => void signOut()} aria-label="Sair do sistema">Sair</button>
          </div>
        )}
      </aside>

      <div className="app-main">
        <header className="mobile-header">
          <Logo />
          {demoMode ? (
            <span className="demo-mode-mobile">Teste · {persistenceStatus === 'connected' ? 'PostgreSQL' : 'dados locais'}</span>
          ) : (
            <Link className="avatar" to="/conta" aria-label="Abrir configurações da conta">
              {initials(user?.name ?? 'LB')}
            </Link>
          )}
        </header>
        {demoMode && persistenceMessage && <div className={`persistence-banner ${persistenceStatus}`} role={persistenceStatus === 'error' ? 'alert' : 'status'}>{persistenceMessage}</div>}
        <Outlet />
      </div>

      <nav className="bottom-nav" aria-label="Navegação principal para celular">
        {visibleNavItems.map((item) => (
          <Link key={item.label} to={item.href} className={isActive(item.href) ? 'is-active' : ''} aria-current={isActive(item.href) ? 'page' : undefined}>
            <span aria-hidden="true">{item.icon}</span>
            <small>{item.label}</small>
          </Link>
        ))}
      </nav>
    </div>
  )
}
