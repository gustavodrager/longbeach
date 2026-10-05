import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { PrototypeProvider, usePrototype } from './PrototypeProvider'
import { actorNames, money } from './model'
import { EmptyState, Icon } from './components'
import { SellPage, TabsPage, TabPage, OrdersPage, ReceivePage, CashPage, ReceiptPage } from './AttendantPages'
import { ManagementPage, ReportPage, ManagementRecordPage, RoadmapPage } from './ManagementPages'
import { ClientPage } from './ClientPages'
import type { ActorId } from './types'
import './prototype.css'

const attendantNav = [
  { title: 'Vender', href: '/prototipo/vender', icon: 'sell' },
  { title: 'Comandas', href: '/prototipo/comandas', icon: 'tabs' },
  { title: 'Pedidos', href: '/prototipo/pedidos', icon: 'orders' },
  { title: 'Meu caixa', href: '/prototipo/caixa', icon: 'cash' },
] as const
const managementNav = [
  { title: 'Visão geral', href: '/prototipo/gestao', icon: 'chart' },
  { title: 'Bar e caixa', href: '/prototipo/gestao/detalhes/consumed', icon: 'sell' },
  { title: 'Agenda e reservas', href: '/prototipo/gestao/fases/agenda', icon: 'clock' },
  { title: 'Escola e alunos', href: '/prototipo/gestao/fases/escola', icon: 'tabs' },
  { title: 'Financeiro', href: '/prototipo/gestao/fases/financeiro', icon: 'cash' },
  { title: 'Equipe e materiais', href: '/prototipo/gestao/fases/equipe', icon: 'orders' },
] as const

function ManagementGuard() {
  const { actorId, setActorId } = usePrototype()
  if (actorId === 'supervisor') return <Outlet />
  return <section className="ux-page"><EmptyState title="Acesso da gestão restrito" description="Esta pessoa pode atender, mas não pode consultar informações administrativas."><button className="ux-button primary" onClick={() => setActorId('supervisor')}>Simular supervisão</button></EmptyState><p className="ux-note">Trocar o perfil aqui é apenas uma ferramenta do protótipo com dados fictícios.</p></section>
}

function PrototypeShell() {
  const { state, actorId, setActorId, offline, setOffline, storageError, settlePix, reset } = usePrototype()
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const [toolsError, setToolsError] = useState('')
  const [showModes, setShowModes] = useState(false)
  const [resetRequested, setResetRequested] = useState(false)
  const management = location.pathname.startsWith('/prototipo/gestao')
  const client = location.pathname.startsWith('/prototipo/cliente')
  const requests = state.consumptions.filter(item => item.status === 'requested').length
  const activeCash = state.cashSessions.find(session => session.actorId === actorId && session.state === 'open')
  const clientAccount = state.accounts.find(account => account.state === 'open' && !account.accessRevoked)
  const pending = state.payments.filter(payment => payment.state === 'pending')
  useEffect(() => { mainRef.current?.focus(); window.scrollTo?.(0, 0); setShowModes(false) }, [location.pathname])
  return <div className={`ux-root ${management ? 'ux-management' : client ? 'ux-client' : 'ux-attendant'}`}>
    <a className="ux-skip" href="#ux-content">Ir para o conteúdo</a>
    <div className="ux-prototype-banner"><span className="ux-banner-dot" />Protótipo · dados fictícios · nenhuma cobrança real</div>
    <header className="ux-app-header"><Link className="ux-brand" to={client ? location.pathname : management ? '/prototipo/gestao' : '/prototipo/vender'} aria-label="Long Beach Arena — início do protótipo"><img src="/prototype-assets/logo-horizontal.svg" alt="Long Beach Arena" /></Link>{!client && <button className="ux-mobile-switch" type="button" aria-expanded={showModes} onClick={() => setShowModes(value => !value)}>Experiências<Icon name="arrow" size={16} /></button>}{!client && <div className={`ux-mode-switch${showModes ? " is-open" : ""}`} aria-label="Experiências do protótipo"><Link to="/prototipo/vender" className={!management ? 'selected' : ''}>Atendimento</Link><Link to="/prototipo/gestao" onClick={() => setActorId("supervisor")} className={management ? 'selected' : ''}>Gestão</Link>{clientAccount && <Link to={`/prototipo/cliente/${clientAccount.accessId}`}>Cliente</Link>}</div>}<span className="ux-header-person"><span className="ux-avatar">{management ? 'G' : client ? 'C' : actorNames[actorId].slice(0, 1)}</span><span><strong>{management ? 'Gestão da arena' : client ? 'Cliente' : actorNames[actorId]}</strong><small>{management ? 'Painel administrativo' : client ? 'Minha comanda' : activeCash ? 'Seu caixa está aberto' : 'Seu caixa está fechado'}</small></span></span></header>
    {!client && <div className="ux-demo-toolbar"><details className="ux-demo-tools"><summary><Icon name="settings" size={18} />Testar situações<span className="ux-demo-tools-hint"> · trocar atendente, conexão e Pix</span></summary><div className="ux-demo-controls"><label className="ux-field">Pessoa na simulação<select value={actorId} onChange={event => setActorId(event.target.value as ActorId)}><option value="marina">Marina · atendimento</option><option value="rafael">Rafael · atendimento</option><option value="supervisor">Supervisão · autorizações</option></select></label><label className="ux-demo-toggle"><input type="checkbox" checked={offline} onChange={event => setOffline(event.target.checked)} />Simular falta de internet</label><button className="ux-button secondary" type="button" onClick={() => setResetRequested(true)}>Recomeçar demonstração</button>{resetRequested && <section className="ux-provider-simulator"><strong>Recomeçar os dados fictícios?</strong><p>Os pedidos da demonstração serão reiniciados.</p><div className="ux-actions"><button className="ux-button secondary" type="button" onClick={() => setResetRequested(false)}>Cancelar</button><button className="ux-button primary" type="button" onClick={() => { reset(); setToolsError(''); setResetRequested(false) }}>Sim, recomeçar</button></div></section>}{pending.length > 0 && <div className="ux-provider-simulator"><strong>Simular resposta do provedor Pix</strong><p>Estes botões servem apenas para testar a interface.</p>{pending.map(payment => <div className="ux-actions" key={payment.id}><span>Comanda {state.accounts.find(account => account.id === payment.accountId)?.number} · {money(payment.amountCents)}</span><button type="button" className="ux-button secondary" onClick={() => { const result = settlePix(payment.id, true, crypto.randomUUID()); setToolsError(result.ok ? '' : result.error) }}>Simular Pix aprovado</button><button type="button" className="ux-button secondary" onClick={() => { const result = settlePix(payment.id, false, crypto.randomUUID()); setToolsError(result.ok ? '' : result.error) }}>Simular Pix recusado</button></div>)}</div>}{toolsError && <p className="ux-notice error" role="alert">{toolsError}</p>}</div></details></div>}
    {offline && <div className="ux-connection-banner" role="status"><Icon name="alert" size={20} />Sem internet na simulação. Nenhuma nova operação será registrada.</div>}
    {storageError && <div className="ux-connection-banner" role="alert">{storageError}</div>}
    <div className="ux-body">{!client && <aside className="ux-sidebar"><p className="ux-sidebar-caption">{management ? 'GESTÃO' : 'ATENDIMENTO'}</p><nav aria-label={management ? 'Navegação da gestão' : 'Navegação do atendimento'}>{(management ? managementNav : attendantNav).map(item => <NavLink className={({ isActive }) => `ux-nav-link${isActive ? ' selected' : ''}`} end={item.href === '/prototipo/gestao' || item.href === '/prototipo/vender'} key={item.href} to={item.href}><Icon name={item.icon} /><span>{item.title}</span>{item.icon === 'orders' && !management && requests > 0 && <span className="ux-nav-badge">{requests}</span>}</NavLink>)}</nav><div className="ux-sidebar-bottom"><img src="/prototype-assets/logo-symbol.svg" alt="" /><p>Mais tempo para<br /><strong>quem está em jogo.</strong></p><a href="/" className="ux-exit-link">Voltar ao sistema<Icon name="arrow" size={18} /></a></div></aside>}<main id="ux-content" className="ux-main" tabIndex={-1} ref={mainRef}><Outlet /></main></div>
    {!client && !management && <nav className="ux-bottom-nav" aria-label="Atendimento no celular">{attendantNav.map(item => <NavLink key={item.href} to={item.href} end={item.href === '/prototipo/vender'} className={({ isActive }) => isActive ? 'selected' : ''}><span className="ux-bottom-icon"><Icon name={item.icon} />{item.icon === 'orders' && requests > 0 && <b>{requests}</b>}</span><span>{item.title}</span></NavLink>)}</nav>}
  </div>
}

export function PrototypeApp() {
  return <PrototypeProvider><Routes><Route element={<PrototypeShell />}><Route index element={<Navigate to="vender" replace />} /><Route path="vender" element={<SellPage />} /><Route path="comandas" element={<TabsPage />} /><Route path="comandas/:accountId" element={<TabPage />} /><Route path="pedidos" element={<OrdersPage />} /><Route path="receber/:accountId" element={<ReceivePage />} /><Route path="caixa" element={<CashPage />} /><Route path="comprovante/:paymentId" element={<ReceiptPage />} /><Route path="cliente/:accessId" element={<ClientPage />} /><Route path="gestao" element={<ManagementGuard />}><Route index element={<ManagementPage />} /><Route path="detalhes/:metric" element={<ReportPage />} /><Route path="comandas/:accountId" element={<ManagementRecordPage />} /><Route path="pagamentos/:paymentId" element={<ManagementRecordPage />} /><Route path="caixas/:sessionId" element={<ManagementRecordPage />} /><Route path="estoque/:productId" element={<ManagementRecordPage />} /><Route path="fases/:phase" element={<RoadmapPage />} /></Route><Route path="*" element={<Navigate to="/prototipo/vender" replace />} /></Route></Routes></PrototypeProvider>
}
