import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../features/auth/authContext'
import { useOperations, type OperationalKind } from '../features/operations/DemoDataProvider'
import { Logo } from './Logo'
import { NavigationIcon, type IconName } from './NavigationIcon'
import { useQueryClient } from '@tanstack/react-query'

type NavigationItem = { label: string; icon: IconName; href: string; group?: string; kind?: OperationalKind; permission?: string; owner?: boolean }
const managementItems: NavigationItem[] = [
  { label: 'Início', icon: 'home', href: '/', group: 'Arena' },
  { label: 'Agenda', icon: 'calendar', href: '/agenda', kind: 'reservations', group: 'Arena' },
  { label: 'Escola', icon: 'school', href: '/escola', kind: 'classes', group: 'Arena' },
  { label: 'Alunos', icon: 'people', href: '/alunos', kind: 'students', group: 'Arena' },
  { label: 'Financeiro', icon: 'wallet', href: '/financeiro', kind: 'financeEntries', group: 'Arena' },
  { label: 'Equipe', icon: 'people', href: '/equipe', kind: 'team', group: 'Estrutura' },
  { label: 'Materiais da arena', icon: 'box', href: '/estoque', kind: 'inventory', group: 'Estrutura' },
  { label: 'Projetos', icon: 'project', href: '/projetos', kind: 'projects', group: 'Estrutura' },
  { label: 'Manutenção', icon: 'tools', href: '/manutencao', kind: 'maintenance', group: 'Estrutura' },
  { label: 'Gestão do bar', icon: 'bar', href: '/bar/indicadores', permission: 'bar:finance:read', group: 'Bar' },
  { label: 'Produtos do bar', icon: 'box', href: '/bar/produtos', permission: 'bar:catalog:write', group: 'Bar' },
  { label: 'Receitas do bar', icon: 'orders', href: '/bar/receitas', permission: 'bar:catalog:write', group: 'Bar' },
  { label: 'Estoque do bar', icon: 'stock', href: '/bar/estoque', permission: 'bar:stock:read', group: 'Bar' },
  { label: 'Inventário do bar', icon: 'check', href: '/bar/inventario', permission: 'bar:stock:manage', group: 'Bar' },
  { label: 'Compras do bar', icon: 'download', href: '/bar/compras', permission: 'bar:purchases:manage', group: 'Bar' },
  { label: 'Caixas da equipe', icon: 'wallet', href: '/bar/caixa', permission: 'bar:supervise', group: 'Bar' },
  { label: 'Importações', icon: 'upload', href: '/importacoes', owner: true, group: 'Administração' },
]
const attendantItems: NavigationItem[] = [
  { label: 'Vender', icon: 'plus', href: '/atendimento/vender' },
  { label: 'Comandas', icon: 'orders', href: '/atendimento/comandas' },
  { label: 'Pedidos', icon: 'check', href: '/atendimento/pedidos' },
  { label: 'Meu caixa', icon: 'wallet', href: '/atendimento/caixa' },
]
function initials(name: string) { return name.split(' ').slice(0, 2).map(part => part[0]).join('').toUpperCase() }

export function AppShell({ demoMode = false }: { demoMode?: boolean }) {
  const { user, signOut } = useAuth()
  const { persistenceStatus, persistenceMessage, canRead, reload, saving, refreshFailed } = useOperations()
  const queryClient = useQueryClient()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const mainRef = useRef<HTMLDivElement>(null)
  const has = (permission: string) => demoMode || Boolean(user?.roles.includes('Owner') || user?.permissions.includes(permission))
  const management = managementItems.filter(item => !demoMode || !item.permission).filter(item => !item.kind || canRead(item.kind)).filter(item => !item.permission || has(item.permission)).filter(item => !item.owner || (!demoMode && user?.roles.includes('Owner')))
  const canManage = management.some(item => item.kind) || ['bar:finance:read', 'bar:catalog:write', 'bar:stock:manage', 'bar:purchases:manage', 'bar:supervise'].some(permission => has(permission))
  const canAttend = !demoMode && has('bar:sales:operate')
  const attendance = location.pathname.startsWith('/atendimento') || (!canManage && canAttend)
  const visibleItems = attendance ? attendantItems : management
  const isActive = (href: string) => href === '/' ? location.pathname === '/' : href === '/escola' ? location.pathname.startsWith('/escola') : href === '/bar/indicadores' ? location.pathname === href : location.pathname.startsWith(href)
  useEffect(() => { setMenuOpen(false); mainRef.current?.focus({ preventScroll: true }) }, [location.pathname])
  const account = demoMode ? <span className="demo-mode-mobile">Teste · dados fictícios</span> : <Link className="avatar" to="/conta" aria-label="Abrir configurações da conta">{initials(user?.name ?? 'LB')}</Link>
  const modeLink = canAttend && canManage ? <Link className="shell-mode-link" to={attendance ? '/' : '/atendimento/vender'}>{attendance ? 'Gestão da arena' : 'Abrir atendimento'} <span aria-hidden="true">→</span></Link> : null
  const section = visibleItems.find(item => isActive(item.href))?.label ?? (location.pathname === '/conta' ? 'Minha conta' : 'Gestão da arena')
  const nav = <nav aria-label={attendance ? 'Atendimento' : 'Gestão da arena'}>{Array.from(new Set(visibleItems.map(item => item.group ?? 'Atendimento'))).map(group => <div className="nav-group" key={group}>{!attendance && <p className="nav-group-title">{group}</p>}{visibleItems.filter(item => (item.group ?? 'Atendimento') === group).map(item => <Link key={item.label} to={item.href} className={isActive(item.href) ? 'nav-item is-active' : 'nav-item'} aria-current={isActive(item.href) ? 'page' : undefined}><NavigationIcon name={item.icon} /><span>{item.label}</span></Link>)}</div>)}</nav>
  async function refreshData() {
    if (refreshing || saving) return
    setRefreshing(true)
    try { await Promise.all([reload(), queryClient.invalidateQueries()]) }
    finally { setRefreshing(false) }
  }

  return <div className={`app-shell ${attendance ? 'app-shell-attendance' : 'app-shell-management'}`}>
    <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
    <aside className="side-nav"><Logo />{modeLink}{nav}
      {demoMode ? <div className="demo-mode-indicator" role="note">Modo de teste<span>{persistenceStatus === 'connected' ? 'Dados fictícios · PostgreSQL conectado' : 'Dados fictícios · salvos neste navegador'}</span></div> : <div className="side-account"><Link className="side-account-summary" to="/conta" aria-label="Abrir configurações da conta"><div className="avatar" aria-hidden="true">{initials(user?.name ?? 'LB')}</div><div><strong>{user?.name}</strong><span>{user?.roles[0] ?? 'Equipe'}</span></div></Link><button type="button" onClick={() => void signOut()}>Sair</button></div>}
    </aside>
    <div className="app-main">
      <header className="mobile-header"><Link className="shell-brand-link" to={attendance ? '/atendimento/vender' : '/'} aria-label={attendance ? 'Início do atendimento' : 'Início da gestão'}><Logo /></Link>{attendance && canManage && <Link className="mobile-mode-link" to="/">Gestão <span aria-hidden="true">↗</span></Link>}{account}{!attendance && <button className="shell-menu-button" type="button" aria-expanded={menuOpen} aria-controls="menu-arena" onClick={() => setMenuOpen(open => !open)}><NavigationIcon name="menu" /> Menu</button>}</header>
      {!attendance && <div id="menu-arena" className="shell-mobile-menu" hidden={!menuOpen}>{modeLink}{nav}{!demoMode && <button type="button" className="text-button" onClick={() => void signOut()}>Sair do sistema</button>}</div>}
      {!attendance && <div className="management-topbar"><div className="shell-location"><span>Long Beach Arena</span><strong>{section}</strong></div><button type="button" className="shell-refresh" onClick={() => void refreshData()} disabled={refreshing || saving || persistenceStatus === 'connecting'}><span aria-hidden="true">↻</span>{refreshing ? 'Atualizando…' : 'Atualizar dados'}</button></div>}
      {(persistenceMessage && (persistenceStatus === 'error' || demoMode) || refreshFailed) && <div className={`persistence-banner ${refreshFailed ? 'warning' : persistenceStatus}`} role={persistenceStatus === 'error' || refreshFailed ? 'alert' : 'status'}>{refreshFailed ? 'Não foi possível atualizar os dados. A última leitura foi preservada; confira a conexão e tente novamente.' : persistenceMessage}{(persistenceStatus === 'error' || refreshFailed) && <button type="button" onClick={() => void reload()}>Tentar novamente</button>}</div>}
      <div id="conteudo" ref={mainRef} tabIndex={-1} className="shell-content"><Outlet /></div>
    </div>
    {attendance && <nav className="bottom-nav" aria-label="Atendimento para celular">{attendantItems.map(item => <Link key={item.label} to={item.href} className={isActive(item.href) ? 'is-active' : ''} aria-current={isActive(item.href) ? 'page' : undefined}><NavigationIcon name={item.icon} /><small>{item.label}</small></Link>)}</nav>}
  </div>
}
