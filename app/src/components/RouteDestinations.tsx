import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../features/auth/authContext'
import { barHome, workHome } from '../features/auth/access'

// Preserve filters, anchors and return context when opening an existing bookmark.
export function LegacyDestination({ to, parameter }: { to: string; parameter?: string }) {
  const location = useLocation(); const params = useParams()
  const suffix = parameter && params[parameter] ? '/' + encodeURIComponent(params[parameter]!) : ''
  return <Navigate replace to={{ pathname: to + suffix, search: location.search, hash: location.hash }} state={location.state} />
}
export function BarDestination() {
  const { user } = useAuth(); const destination = barHome(user)
  return destination ? <LegacyDestination to={destination} /> : <main className="operation-page"><h1>Acesso restrito</h1><p>Seu perfil não possui uma área de trabalho no bar.</p><Link to={workHome(user)}>Voltar à minha área</Link></main>
}
export function MissingDestination() {
  const { user } = useAuth()
  return <main className="operation-page"><h1>Página não encontrada</h1><p>Este endereço não corresponde a uma página disponível. Confira o link ou volte à sua área.</p><Link className="primary-link" to={workHome(user)}>Voltar à minha área</Link></main>
}
