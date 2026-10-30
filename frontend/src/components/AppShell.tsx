import { useBarData, type PageResult, type Tab } from '../features/attendance/api'
import { hasPermission, hasWorkArea, isManagement, profileLabel, profileRole } from '../features/auth/access'
import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../features/auth/authContext'
import { useOperations } from '../features/operations/DemoDataProvider'
import { Logo } from './Logo'
import { NavigationIcon } from './NavigationIcon'
import { barNavigation, barNavigationPath, destinationFor, routeMatches, visibleNavigation, type Destination } from './navigation'
import { ModalPanel, NavigationMemory } from './managementUi'

function initials(name: string) { return name.split(' ').slice(0, 2).map(part => part[0]).join('').toUpperCase() }
export function AppShell({ demoMode = false }: { demoMode?: boolean }) {
  const { user, signOut } = useAuth()
  const { persistenceStatus, persistenceMessage, canRead, reload, refreshFailed } = useOperations()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const mainRef = useRef<HTMLDivElement>(null)
  const has = (permission: string) => permission === 'portal:manage' ? Boolean(hasPermission(user,'students:write') && hasPermission(user,'projects:write')) : permission === 'session' ? Boolean(user) : demoMode || hasPermission(user, permission)
  const can = (item: Destination) => (!item.kind || canRead(item.kind)) && (!item.permission || !demoMode && has(item.permission)) && (!item.anyPermission || !demoMode && item.anyPermission.some(has)) && (!item.owner || !demoMode && isManagement(user))
  const management = visibleNavigation(can)
  const canManage = demoMode || isManagement(user) || profileRole(user) === 'Operations'
  const canAttend = !demoMode && has('bar:sales:operate')
  const attendance = !demoMode && (location.pathname.startsWith('/atendimento') || location.pathname.startsWith('/bar'))
  const barPath = barNavigationPath(location.pathname)
  const barItems = barNavigation.filter(can)
  const attendants = barItems.filter(item => barNavigation.indexOf(item) < 4)
  const pendingOrders = useBarData<PageResult<Tab>>('/tabs?state=Orders&page=1&pageSize=1',attendance && has('bar:sales:read') && has('bar:sales:operate'))
  const orderBadge = pendingOrders.data && pendingOrders.data.total > 0 ? <span className="bar-menu-badge" aria-label={`${pendingOrders.data.total} comandas com pedidos pendentes`}>{pendingOrders.data.total}</span> : null
  const secondary = barItems.filter(item => barNavigation.indexOf(item) >= 4)
  const current = destinationFor(location.pathname, management)
  useEffect(() => { setMenuOpen(false); mainRef.current?.focus({ preventScroll: true }) }, [location.pathname])
  const modeLink = attendance && canManage ? <Link className="shell-mode-link" to="/">Área de trabalho <span aria-hidden="true">→</span></Link> : canAttend ? <Link className="shell-mode-link" to="/atendimento/vender">Abrir Bar <span aria-hidden="true">→</span></Link> : null
  const account = demoMode ? <span className="demo-mode-mobile">Teste · dados fictícios</span> : <Link className="avatar" to="/conta" aria-label="Abrir configurações da conta">{initials(user?.name ?? 'LB')}</Link>
  const nav = <nav aria-label={attendance ? 'Atendimento' : 'Área de trabalho'}>{(attendance ? barItems : management).map(item => {
    const active = attendance ? routeMatches(barPath, item.href) : current?.group.label === item.label
    return <Link key={item.label} to={item.href} className={'nav-item ' + (active ? 'is-active' : '')} aria-current={active ? 'page' : undefined}><NavigationIcon name={item.icon} /><span>{item.label}{attendance && item.href==='/atendimento/pedidos' && orderBadge}</span></Link>
  })}</nav>
  const admin = !demoMode && <nav className="shell-admin" aria-label="Minha conta"><Link to="/minha-area"><NavigationIcon name="people" />Minha área</Link>{profileRole(user) === 'Teacher' && <Link to="/professor">Minhas aulas</Link>}<Link to="/conta">Segurança</Link></nav>
  return <div className={'app-shell ' + (attendance ? 'app-shell-attendance' : 'app-shell-management')}>
    <NavigationMemory /><a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
    <aside className="side-nav"><Logo />{modeLink}{nav}{admin}
      {demoMode ? <div className="demo-mode-indicator" role="note">Modo de teste<span>{persistenceStatus === 'connected' ? 'Dados fictícios · PostgreSQL conectado' : 'Dados fictícios · salvos neste navegador'}</span></div> : <div className="side-account"><Link className="side-account-summary" to="/conta" aria-label="Abrir configurações da conta"><div className="avatar" aria-hidden="true">{initials(user?.name ?? 'LB')}</div><div><strong>{user?.name}</strong><span>{profileLabel(user)}</span></div></Link><button type="button" onClick={() => void signOut()}>Sair</button></div>}
    </aside>
    <div className="app-main">
      <header className="mobile-header"><Link className="shell-brand-link" to={attendance ? '/atendimento/vender' : '/'} aria-label={attendance ? 'Início do atendimento' : 'Início da gestão'}><Logo /></Link>{!demoMode && hasWorkArea(user) && <Link className="mobile-mode-link" to="/minha-area">Minha área</Link>}{attendance && canManage && <Link className="mobile-mode-link" to="/">Gestão <span aria-hidden="true">↗</span></Link>}{account}{!attendance && <button className="shell-menu-button" type="button" aria-expanded={menuOpen} aria-haspopup="dialog" onClick={() => setMenuOpen(true)}><NavigationIcon name="menu" /> Menu</button>}</header>
      {menuOpen && attendance && <ModalPanel title="Mais opções do Bar" onClose={() => setMenuOpen(false)} className="navigation-dialog"><nav aria-label="Gestão do Bar">{secondary.map(item => <Link key={item.href} to={item.href} onClick={() => setMenuOpen(false)}><NavigationIcon name={item.icon}/>{item.label}</Link>)}</nav>{modeLink}{admin}</ModalPanel>}
      {menuOpen && !attendance && <ModalPanel title="Menu da arena" onClose={() => setMenuOpen(false)} className="navigation-dialog">{modeLink}<nav aria-label="Áreas da arena">{management.map(group => group.children ? <details key={group.label} open={current?.group.label === group.label}><summary><NavigationIcon name={group.icon} />{group.label}</summary><div>{group.children.flatMap(child => [child, ...(child.related ?? [])].map(destination => <Link key={destination.href} to={destination.href} aria-current={current?.destination.href === destination.href ? 'page' : undefined} className={destination.href !== child.href ? 'navigation-related-link' : undefined} onClick={() => setMenuOpen(false)}>{destination.label}</Link>))}</div></details> : <Link key={group.href} to={group.href} onClick={() => setMenuOpen(false)}><NavigationIcon name={group.icon} />{group.label}</Link>)}</nav>{admin}{!demoMode && <button className="text-button" onClick={() => void signOut()}>Sair do sistema</button>}</ModalPanel>}
      {!attendance && <div className="management-topbar"><nav className="shell-location" aria-label="Localização"><Link to="/">Long Beach</Link>{current && current.group.href !== '/' && <><span aria-hidden="true">/</span><Link to={current.group.href}>{current.group.label}</Link>{current.group.children && current.destination.href !== current.group.href && <><span aria-hidden="true">/</span><strong>{current.destination.label}</strong></>}</>}{!current && <strong>{location.pathname === '/conta' ? 'Minha conta' : location.pathname === '/importacoes' ? 'Importações' : 'Área de trabalho'}</strong>}</nav></div>}
      {!attendance && current?.group.children && <nav className="module-navigation" aria-label={'Navegação de ' + current.group.label}>{current.group.children.map(item => <Link key={item.href} to={item.href} aria-current={item.href === current.item.href ? 'page' : undefined}>{item.label}</Link>)}</nav>}
      {!attendance && current?.item.related?.length ? <nav className="related-navigation" aria-label={'Seções de ' + current.item.label}>{[current.item, ...current.item.related].map(item => <Link key={item.href} to={item.href} aria-current={item.href === current.destination.href ? 'page' : undefined}>{item.label}</Link>)}</nav> : null}
      {(persistenceMessage && (persistenceStatus === 'error' || demoMode) || refreshFailed) && <div className={'persistence-banner ' + (refreshFailed ? 'warning' : persistenceStatus)} role={persistenceStatus === 'error' || refreshFailed ? 'alert' : 'status'}>{refreshFailed ? 'Não foi possível atualizar os dados. A última leitura foi preservada; confira a conexão e tente novamente.' : persistenceMessage}{(persistenceStatus === 'error' || refreshFailed) && <button type="button" onClick={() => void reload()}>Tentar novamente</button>}</div>}
      <div id="conteudo" ref={mainRef} tabIndex={-1} className="shell-content"><Outlet /></div>
    </div>
    {attendance && <nav className="bottom-nav bar-bottom-nav" aria-label="Atendimento para celular">{attendants.map(item => <Link key={item.label} to={item.href} className={routeMatches(barPath, item.href) ? 'is-active' : ''} aria-current={routeMatches(barPath, item.href) ? 'page' : undefined}><NavigationIcon name={item.icon} /><small>{item.label}{item.href==='/atendimento/pedidos' && orderBadge}</small></Link>)}{secondary.length > 0 && <button className={secondary.some(item=>routeMatches(barPath,item.href))?'is-active':undefined} type="button" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><NavigationIcon name="menu"/><small>Mais</small></button>}</nav>}
  </div>
}
