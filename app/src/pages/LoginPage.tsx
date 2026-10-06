import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { useAuth } from '../features/auth/authContext'

import { GoogleSignInButton } from '../features/auth/GoogleSignInButton'

export function LoginPage() {
  const { user, isBootstrapping, signIn, signInWithGoogle } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
  const [passwordChanged] = useState(() => {
    if ((location.state as { passwordChanged?: boolean } | null)?.passwordChanged === true) {
      return true
    }

    try {
      const changed = sessionStorage.getItem('lb_password_changed') === '1'
      if (changed) sessionStorage.removeItem('lb_password_changed')
      return changed
    } catch {
      return false
    }
  })

  if (user) return <Navigate to={user.requiresFirstAccess ? '/primeiro-acesso' : '/'} replace />

  async function handleGoogle(credential: string) {
    setError(''); setIsSubmitting(true)
    try { await signInWithGoogle(credential) }
    catch { setError('Esta conta Google ainda não está vinculada. No primeiro acesso, entre com seu usuário e senha inicial.') }
    finally { setIsSubmitting(false) }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      await signIn({ email, password })
      const requestedPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/'
      navigate(requestedPath, { replace: true })
    } catch {
      setError('Usuário ou senha inválidos, ou acesso inicial expirado. Confira os dados e tente novamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand"><Logo /></div>
        <div className="login-heading">
          <p className="eyebrow">Gestão da arena</p>
          <h1 id="login-title">Entre no Long Beach OS</h1>
          <p>Use seu usuário e senha ou entre com sua conta Google vinculada.</p>
        </div>

        {googleClientId && <div className="login-google"><GoogleSignInButton onCredential={credential => void handleGoogle(credential)} onError={setError} disabled={isSubmitting} /><p className="login-divider">ou entre com usuário e senha</p></div>}
        <form onSubmit={handleSubmit} className="login-form">
          {passwordChanged && (
            <p className="form-success" role="status">
              Senha alterada. Entre novamente com a nova senha.
            </p>
          )}
          <label>
            <span>Usuário ou e-mail</span>
            <input
              type="text"
              name="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Seu usuário ou e-mail"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={320}
              required
            />
          </label>
          <label>
            <span>Senha</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Digite sua senha"
              required
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={isSubmitting || isBootstrapping}>
            {isSubmitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        <details className="login-recovery"><summary>Preciso recuperar meu acesso</summary><p>Se você vinculou seu Google, use a mesma conta. Caso contrário, procure a equipe da Long Beach no balcão para confirmar sua identidade e recuperar o acesso. Nunca informe sua senha à equipe.</p></details>
        <p className="login-footnote">Acesso exclusivo para a equipe Long Beach.</p>
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
