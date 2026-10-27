import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSignInOptions } from '../features/auth/authApi'
import { Navigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { useAuth } from '../features/auth/authContext'

import { GoogleSignInButton } from '../features/auth/GoogleSignInButton'

export function LoginPage() {
  const { user, isBootstrapping, signInWithGoogle, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const options = useQuery({ queryKey: ['sign-in-options'], queryFn: getSignInOptions, retry: false, staleTime: 0 })
  const googleClientId = !options.isError ? options.data?.googleClientId : null
  const registrationEnabled = Boolean(googleClientId && options.data?.clientRegistrationEnabled)
  const homologation = !options.isError && options.data?.homologationLoginEnabled === true
  if (user) return <Navigate to={user.requiresFirstAccess ? '/primeiro-acesso' : '/'} replace />

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
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand"><Logo tagline="Sua arena, no seu ritmo" /></div>
        <div className="login-heading">
          <p className="eyebrow">{homologation ? 'Homologação PagBank' : 'Sua Long Beach'}</p>
          <h1 id="login-title">Entre no Long Beach OS</h1>
          <p>{homologation ? 'Ambiente de testes com dados fictícios e pagamentos Sandbox.' : registrationEnabled ? 'Entre ou crie sua conta de cliente com o Google.' : 'Use sua conta Google para acessar a arena.'}</p>
        </div>

        {googleClientId && <div className="login-google"><GoogleSignInButton clientId={googleClientId} onCredential={credential => void handleGoogle(credential)} onError={setError} disabled={isSubmitting || isBootstrapping} /><p>{registrationEnabled ? 'Primeira visita? Criaremos sua conta de cliente. Aulas e grupos existentes serão vinculados após conferência da equipe.' : 'Use sua conta Google já vinculada à arena.'}</p></div>}
        {options.isPending && <p role="status">Carregando opções de acesso…</p>}
        {options.isError && <p role="alert">Não foi possível consultar o acesso Google. <button className="text-button" type="button" onClick={() => void options.refetch()}>Tentar novamente</button></p>}
        {homologation && <form onSubmit={event => { event.preventDefault(); void handleHomologation() }}>
          <label htmlFor="homolog-email">E-mail de teste</label>
          <input id="homolog-email" type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} />
          <label htmlFor="homolog-password">Senha de teste</label>
          <input id="homolog-password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />
          <button type="submit" disabled={isSubmitting || isBootstrapping}>Entrar na homologação</button>
        </form>}
        {options.isSuccess && !googleClientId && !homologation && <p role="alert">O acesso com Google está indisponível no momento. Tente novamente ou procure a equipe da arena. <button className="text-button" type="button" onClick={() => void options.refetch()}>Tentar novamente</button></p>}
        {isSubmitting && <p role="status">{homologation ? 'Entrando…' : 'Entrando com Google…'}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {!homologation && <details className="login-recovery"><summary>Preciso recuperar meu acesso</summary><p>Use a mesma conta Google do seu cadastro. Se perdeu o acesso, <a href="https://accounts.google.com/signin/recovery" target="_blank" rel="noreferrer">recupere sua conta no Google</a>. Para conferir seu vínculo com a arena, procure a equipe.</p></details>}
        <p className="login-footnote">Acesso para clientes e equipe Long Beach.</p>
      </section>

      <aside className="login-visual" aria-hidden="true">
        <div className="sun" />
        <div className="court-line court-line-one" />
        <div className="court-line court-line-two" />
        <p>Uma arena inteira,<br />organizada em um só lugar.</p>
      </aside>
    </main>
  )
}
