import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../features/auth/authContext'
import { useOperations } from '../features/operations/DemoDataProvider'
import { Logo } from './Logo'
import { NavigationIcon } from './NavigationIcon'
import { useQueryClient } from '@tanstack/react-query'
import { attendantNavigation, destinationFor, routeMatches, visibleNavigation, type Destination } from './navigation'
import { ModalPanel, NavigationMemory } from './managementUi'

function initials(name: string) { return name.split(' ').slice(0, 2).map(part => part[0]).join('').toUpperCase() }
export function AppShell({ demoMode = false }: { demoMode?: boolean }) {
  const { user, signOut } = useAuth()
  const { persistenceStatus, persistenceMessage, canRead, reload, saving, refreshFailed } = useOperations()
  const queryClient = useQueryClient(); const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false); const [refreshing, setRefreshing] = useState(false)
  const mainRef = useRef<HTMLDivElement>(null)
  const has = (permission: string) => demoMode || Boolean(user?.roles.includes('Owner') || user?.permissions.includes(permission))
  const can = (item: Destination) => (!item.kind || canRead(item.kind)) && (!item.permission || !demoMode && has(item.permission)) && (!item.owner || !demoMode && Boolean(user?.roles.includes('Owner')))
  const management = visibleNavigation(can)
  const canManage = management.some(item => item.href !== '/')
  const canAttend = !demoMode && has('bar:sales:operate')
  const attendance = location.pathname.startsWith('/atendimento') || (!canManage && canAttend)
  const attendants = attendantNavigation.filter(item => has(item.permission!))
  const current = destinationFor(location.pathname, management)
  useEffect(() => { setMenuOpen(false); mainRef.current?.focus({ preventScroll: true }) }, [location.pathname])
  const modeLink = canAttend && canManage ? <Link className="shell-mode-link" to={attendance ? '/' : '/atendimento/vender'}>{attendance ? 'Gestão da arena' : 'Abrir atendimento'} <span aria-hidden="true">→</span></Link> : null
  const account = demoMode ? <span className="demo-mode-mobile">Teste · dados fictícios</span> : <Link className="avatar" to="/conta" aria-label="Abrir configurações da conta">{initials(user?.name ?? 'LB')}</Link>
  const nav = <nav aria-label={attendance ? 'Atendimento' : 'Gestão da arena'}>{(attendance ? attendants : management).map(item => {
    const active = attendance ? routeMatches(location.pathname, item.href) : current?.group.label === item.label
    return <Link key={item.label} to={item.href} className={'nav-item ' + (active ? 'is-active' : '')} aria-current={active ? 'page' : undefined}><NavigationIcon name={item.icon} /><span>{item.label}</span></Link>
  })}</nav>
  const admin = !attendance && <nav className="shell-admin" aria-label="Administração">{!demoMode && user?.roles.includes('Owner') && <Link to="/importacoes" aria-current={location.pathname === '/importacoes' ? 'page' : undefined}><NavigationIcon name="upload" />Importações</Link>}<Link to="/conta"><NavigationIcon name="people" />Minha conta</Link></nav>
  async function refreshData() {
    if (refreshing || saving) return
    setRefreshing(true)
    try { await Promise.all([reload(), queryClient.invalidateQueries()]) } finally { setRefreshing(false) }
  }
  return <div className={'app-shell ' + (attendance ? 'app-shell-attendance' : 'app-shell-management')}>
    <NavigationMemory /><a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
    <aside className="side-nav"><Logo />{modeLink}{nav}{admin}
      {demoMode ? <div className="demo-mode-indicator" role="note">Modo de teste<span>{persistenceStatus === 'connected' ? 'Dados fictícios · PostgreSQL conectado' : 'Dados fictícios · salvos neste navegador'}</span></div> : <div className="side-account"><Link className="side-account-summary" to="/conta" aria-label="Abrir configurações da conta"><div className="avatar" aria-hidden="true">{initials(user?.name ?? 'LB')}</div><div><strong>{user?.name}</strong><span>{user?.roles.includes('Owner') ? 'Proprietário' : 'Equipe'}</span></div></Link><button type="button" onClick={() => void signOut()}>Sair</button></div>}
    </aside>
    <div className="app-main">
      <header className="mobile-header"><Link className="shell-brand-link" to={attendance ? '/atendimento/vender' : '/'} aria-label={attendance ? 'Início do atendimento' : 'Início da gestão'}><Logo /></Link>{attendance && canManage && <Link className="mobile-mode-link" to="/">Gestão <span aria-hidden="true">↗</span></Link>}{account}{!attendance && <button className="shell-menu-button" type="button" aria-expanded={menuOpen} aria-haspopup="dialog" onClick={() => setMenuOpen(true)}><NavigationIcon name="menu" /> Menu</button>}</header>
      {menuOpen && <ModalPanel title="Menu da arena" onClose={() => setMenuOpen(false)} className="navigation-dialog">{modeLink}<nav aria-label="Áreas da arena">{management.map(group => group.children ? <details key={group.label} open={current?.group.label === group.label}><summary><NavigationIcon name={group.icon} />{group.label}</summary><div>{group.children.map(child => <Link key={child.href} to={child.href} aria-current={current?.item.href === child.href ? 'page' : undefined} onClick={() => setMenuOpen(false)}>{child.label}</Link>)}</div></details> : <Link key={group.href} to={group.href} onClick={() => setMenuOpen(false)}><NavigationIcon name={group.icon} />{group.label}</Link>)}</nav>{admin}{!demoMode && <button className="text-button" onClick={() => void signOut()}>Sair do sistema</button>}</ModalPanel>}
      {!attendance && <div className="management-topbar"><nav className="shell-location" aria-label="Localização"><Link to="/">Long Beach</Link>{current && current.group.href !== '/' && <><span aria-hidden="true">/</span><Link to={current.group.href}>{current.group.label}</Link>{current.group.children && <><span aria-hidden="true">/</span><strong>{current.destination.label}</strong></>}</>}{!current && <strong>{location.pathname === '/conta' ? 'Minha conta' : location.pathname === '/importacoes' ? 'Importações' : 'Gestão da arena'}</strong>}</nav><button type="button" className="shell-refresh" aria-label="Atualizar dados" onClick={() => void refreshData()} disabled={refreshing || saving || persistenceStatus === 'connecting'}><span aria-hidden="true">↻</span><span>{refreshing ? 'Atualizando…' : 'Atualizar dados'}</span></button></div>}
      {!attendance && current?.group.children && <nav className="module-navigation" aria-label={'Navegação de ' + current.group.label}>{current.group.children.map(item => <Link key={item.href} to={item.href} aria-current={item.href === current.item.href ? 'page' : undefined}>{item.label}</Link>)}</nav>}
      {!attendance && current?.item.related?.length ? <nav className="related-navigation" aria-label={'Seções de ' + current.item.label}>{[current.item, ...current.item.related].map(item => <Link key={item.href} to={item.href} aria-current={item.href === current.destination.href ? 'page' : undefined}>{item.label}</Link>)}</nav> : null}
      {(persistenceMessage && (persistenceStatus === 'error' || demoMode) || refreshFailed) && <div className={'persistence-banner ' + (refreshFailed ? 'warning' : persistenceStatus)} role={persistenceStatus === 'error' || refreshFailed ? 'alert' : 'status'}>{refreshFailed ? 'Não foi possível atualizar os dados. A última leitura foi preservada; confira a conexão e tente novamente.' : persistenceMessage}{(persistenceStatus === 'error' || refreshFailed) && <button type="button" onClick={() => void reload()}>Tentar novamente</button>}</div>}
      <div id="conteudo" ref={mainRef} tabIndex={-1} className="shell-content"><Outlet /></div>
    </div>
    {attendance && <nav className="bottom-nav" aria-label="Atendimento para celular">{attendants.map(item => <Link key={item.label} to={item.href} className={routeMatches(location.pathname, item.href) ? 'is-active' : ''} aria-current={routeMatches(location.pathname, item.href) ? 'page' : undefined}><NavigationIcon name={item.icon} /><small>{item.label}</small></Link>)}</nav>}
  </div>
}
