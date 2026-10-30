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
  const needsFirstAccess = Boolean(user?.requiresFirstAccess)
  const hasWorkspace = hasWorkArea(user)
  const primaryDestination = !user ? '/login' : needsFirstAccess ? '/primeiro-acesso' : workHome(user)
  const primaryLabel = !user ? 'Entrar' : needsFirstAccess ? 'Concluir acesso' : hasWorkspace ? 'Área de trabalho' : 'Minha área'

  return <main className="visitor-page" aria-labelledby="visitor-title">
    <section className="visitor-entry">
      <Logo showTagline={false} />
      <h1 id="visitor-title">Bem-vindo à Long Beach</h1>

      <nav className="visitor-actions" aria-label="Acessos da Long Beach">
        <Link className="visitor-primary" to={primaryDestination} state={location.state}>{primaryLabel}</Link>
        {user ? <>
          {hasWorkspace && !needsFirstAccess && <Link className="visitor-secondary" to="/minha-area">Minha área</Link>}
        </> : <>
          {canRegister && <Link className="visitor-secondary" to="/login?cadastro=cliente" state={location.state}>Criar conta</Link>}
          {options.isPending && <p className="visitor-status" role="status">Carregando opções de cadastro…</p>}
          {options.isError && <p className="visitor-status" role="status">Não foi possível consultar o cadastro. <button type="button" className="text-button" onClick={() => void options.refetch()}>Tentar novamente</button></p>}
          {options.isSuccess && !canRegister && <p className="visitor-status" role="status">Para criar sua conta, fale com a equipe.</p>}
        </>}
        <Link className="visitor-menu" to="/cardapio/apresentacao">Ver cardápio</Link>
      </nav>

      <details className="visitor-help">
        <summary>Precisa de ajuda?</summary>
        <p>Peça à equipe o QR Code da sua comanda.</p>
        <p>Aulas, reservas e pagamentos aparecem após a equipe vincular seu cadastro.</p>
      </details>
    </section>
  </main>
}
