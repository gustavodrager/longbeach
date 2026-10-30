import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSignInOptions } from '../features/auth/authApi'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { useAuth } from '../features/auth/authContext'

import { GoogleSignInButton } from '../features/auth/GoogleSignInButton'
import { loginDestination } from '../features/auth/loginDestination'
import './auth-entry.css'

export function LoginPage() {
  const { user, isBootstrapping, signInWithGoogle, signIn } = useAuth()
  const location = useLocation()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const options = useQuery({ queryKey: ['sign-in-options'], queryFn: getSignInOptions, retry: false, staleTime: 0 })
  const googleClientId = !options.isError ? options.data?.googleClientId : null
  const registrationEnabled = Boolean(googleClientId && options.data?.clientRegistrationEnabled)
  const registrationRequested = params.get('cadastro') === 'cliente'
  const registering = registrationRequested && registrationEnabled
  const homologation = !options.isError && options.data?.homologationLoginEnabled === true
  if (user) return <Navigate to={loginDestination(user, location.state?.from)} replace />

  async function handleGoogle(credential: string) {
    setError(''); setIsSubmitting(true)
    try { await signInWithGoogle(credential) }
    catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível entrar com o Google. Tente novamente.') }
    finally { setIsSubmitting(false) }
  }

  async function handleHomologation() {
    setError(''); setIsSubmitting(true)
    try { await signIn({ email, password }) }
    catch { setError('Não foi possível entrar. Confira o acesso de teste fornecido pela Long Beach.') }
    finally { setPassword(''); setIsSubmitting(false) }
  }

  return (
    <main className="auth-entry-page">
      <section className="auth-entry-panel" aria-labelledby="login-title">
        <div className="auth-entry-brand"><Logo showTagline={false} /></div>
        <div className="auth-entry-heading">
          <h1 id="login-title">{registering ? 'Criar conta' : homologation ? 'Entrar na homologação' : 'Entrar'}</h1>
        </div>

        {homologation && <p className="auth-entry-test">Ambiente de teste: dados fictícios e pagamentos Sandbox.</p>}
        {googleClientId && <div className="auth-entry-google"><GoogleSignInButton clientId={googleClientId} onCredential={credential => void handleGoogle(credential)} onError={setError} disabled={isSubmitting || isBootstrapping} /></div>}
        {registrationEnabled && <p className="auth-entry-note">{registering ? 'Ao continuar, criaremos sua conta de cliente.' : 'Se ainda não tiver cadastro, criaremos sua conta de cliente.'}</p>}
        {registrationRequested && options.isSuccess && !registrationEnabled && <p className="auth-entry-status" role="status">O cadastro online está indisponível. Fale com a equipe.</p>}
        {options.isPending && <p className="auth-entry-status" role="status">Carregando opções de acesso…</p>}
        {options.isError && <p className="auth-entry-status" role="alert">Não foi possível consultar o acesso Google. <button className="text-button" type="button" onClick={() => void options.refetch()}>Tentar novamente</button></p>}
        {homologation && <form className="auth-entry-form" onSubmit={event => { event.preventDefault(); void handleHomologation() }}>
          <label htmlFor="homolog-email">E-mail de teste<input id="homolog-email" type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} /></label>
          <label htmlFor="homolog-password">Senha de teste<input id="homolog-password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
          <button className="primary-button" type="submit" disabled={isSubmitting || isBootstrapping}>Entrar na homologação</button>
        </form>}
        {options.isSuccess && !googleClientId && !homologation && <p className="auth-entry-status" role="alert">O acesso com Google está indisponível. <button className="text-button" type="button" onClick={() => void options.refetch()}>Tentar novamente</button></p>}
        {isSubmitting && <p className="auth-entry-status" role="status">{homologation ? 'Entrando…' : 'Entrando com Google…'}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {registrationEnabled && <nav className="auth-entry-actions" aria-label="Opções de conta">{registering
          ? <Link className="auth-entry-secondary" to="/login" state={location.state}>Já tenho conta</Link>
          : <Link className="auth-entry-secondary" to="/login?cadastro=cliente" state={location.state}>Criar conta</Link>}</nav>}
        {!homologation && <details className="auth-entry-help"><summary>Precisa de ajuda?</summary>
          <p>Use a conta Google vinculada ao seu cadastro. <a href="https://accounts.google.com/signin/recovery" target="_blank" rel="noreferrer">Recuperar conta Google</a>.</p>
          <p>Para conferir seu acesso ou vincular aulas, reservas e pagamentos, fale com a equipe.</p>
        </details>}
        <Link className="auth-entry-back" to="/visitante" state={location.state}>Voltar à entrada</Link>
      </section>
    </main>
  )
}
