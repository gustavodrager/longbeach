import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { getSignInOptions } from '../features/auth/authApi'
import { useAuth } from '../features/auth/authContext'
import { hasWorkArea, workHome } from '../features/auth/access'
import './visitor.css'

export function VisitorPage() {
  const { user } = useAuth()
  const location = useLocation()
  const options = useQuery({ queryKey: ['sign-in-options'], queryFn: getSignInOptions, retry: false, staleTime: 0, enabled: !user })
  const canRegister = !user && !options.isError && Boolean(options.data?.googleClientId && options.data.clientRegistrationEnabled)
  return <main className="visitor-page">
    <header className="visitor-header"><Logo tagline="Sua arena, no seu ritmo" /><nav aria-label="Acesso à arena">{user ? <Link to={user.requiresFirstAccess ? '/primeiro-acesso' : workHome(user)}>{hasWorkArea(user) ? 'Área de trabalho' : 'Minha área'}</Link> : <Link to="/login" state={location.state}>Entrar</Link>}</nav></header>
    <section className="visitor-welcome" aria-labelledby="visitor-title"><p className="eyebrow">Long Beach Arena · Visitante</p><h1 id="visitor-title">Seu momento na arena começa aqui.</h1><p>Conheça nosso cardápio e aproveite a Long Beach. Quando quiser, crie sua conta para acompanhar seus próximos encontros.</p><Link className="visitor-primary" to="/cardapio/apresentacao">Ver cardápio</Link></section>
    <div className="visitor-cards">
      <section aria-labelledby="visitor-account"><p className="eyebrow">Perto de você</p><h2 id="visitor-account">Sua Long Beach, no seu celular.</h2><p>Com uma conta de cliente, você pode enviar solicitações e consultar as atividades e contas vinculadas a você pela equipe.</p>{user ? <Link className="visitor-primary" to="/minha-area">Abrir minha área</Link> : <>{canRegister && <Link className="visitor-primary" to="/login?cadastro=cliente" state={location.state}>Cadastrar como cliente</Link>}{options.isPending && <p role="status">Consultando as opções de cadastro…</p>}{options.isError && <p role="status">Não foi possível consultar o cadastro agora. <button type="button" className="text-button" onClick={() => void options.refetch()}>Tentar novamente</button></p>}{options.isSuccess && !canRegister && <p>Para cadastrar seu acesso, procure a equipe da arena. Se você já tem uma conta, use “Entrar”.</p>}</>}<p className="visitor-detail">Aulas, grupos, reservas e pagamentos existentes são vinculados após conferência da equipe.</p></section>
      <section aria-labelledby="visitor-tab"><p className="eyebrow">Já está na arena?</p><h2 id="visitor-tab">Sua comanda tem um acesso próprio.</h2><p>Peça à equipe o QR Code da sua comanda para fazer pedidos e acompanhar o consumo pelo celular.</p><p className="visitor-detail">Você pode consultar o cardápio sem criar uma conta.</p></section>
    </div>
    <footer className="visitor-footer">Long Beach Arena · Quadra, encontros e bons momentos.</footer>
  </main>
}
