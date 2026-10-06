import { useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Logo } from '../../components/Logo'
import { NavigationIcon, type IconName } from '../../components/NavigationIcon'
import { useAuth } from '../auth/authContext'
import { usePortal, type Options } from './api'
import './portal.css'
const destinations: [string,string,IconName][] = [['','Início','home'],['agenda','Minha agenda','calendar'],['bar','Bar','bar'],['pagamentos','Pagamentos','wallet'],['perfil','Perfil','people']]
export function ClientLayout() {
  const { user }=useAuth(); const location=useLocation(); const main=useRef<HTMLDivElement>(null)
  useEffect(()=>{main.current?.focus({preventScroll:true})},[location.pathname])
  return <div className="client-portal"><a className="skip-link" href="#portal-content">Ir para o conteúdo</a><header className="portal-header"><Link to="/minha-area" aria-label="Início da minha área"><Logo tagline="Sua arena, no seu ritmo" /></Link><Link to="/minha-area/ajuda">Preciso de ajuda</Link></header>
    <div id="portal-content" className="portal-content" ref={main} tabIndex={-1}><Outlet /></div>
    {user?.roles.some(r=>r!=='Student')&&<p className="portal-staff-link"><Link to="/">Voltar à área da equipe</Link></p>}
    <nav className="portal-nav" aria-label="Minha área">{destinations.map(([path,title,icon])=><NavLink key={path} end={!path} to={`/minha-area${path?`/${path}`:''}`}><NavigationIcon name={icon}/><span>{title}</span></NavLink>)}</nav>
  </div>
}
export function HelpContact() { const options=usePortal<Options>('options');return <aside className="portal-help"><strong>A equipe está por perto</strong><p>Na arena, procure o balcão. Você também pode enviar uma solicitação de ajuda e acompanhar a resposta aqui.</p>{options.data?.helpUrl&&<a href={options.data.helpUrl} target="_blank" rel="noopener noreferrer">Falar com a arena</a>}</aside> }
