import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { useAuth } from '../features/auth/authContext'

declare global {
  interface Window {
    google?: { accounts: { id: {
      initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void
      renderButton: (element: HTMLElement, options: { theme: string; size: string; width: number; text: string }) => void
    } } }
  }
}

export function LoginPage() {
  const { user, isBootstrapping, signIn, signInWithGoogle } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const googleButton = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    if (!googleClientId || !googleButton.current) return
    let cancelled = false
    const render = () => {
      if (cancelled || !googleButton.current || !window.google) return
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async ({ credential }) => {
          setError('')
          setIsSubmitting(true)
          try {
            await signInWithGoogle(credential)
            const requestedPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/'
            navigate(requestedPath, { replace: true })
          } catch {
            setError('Esta conta Google não está autorizada para o Long Beach OS.')
          } finally {
            setIsSubmitting(false)
          }
        },
      })
      window.google.accounts.id.renderButton(googleButton.current, { theme: 'outline', size: 'large', width: 360, text: 'signin_with' })
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-identity]')
    if (window.google) render()
    else if (existing) existing.addEventListener('load', render, { once: true })
    else {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.dataset.googleIdentity = 'true'
      script.addEventListener('load', render, { once: true })
      document.head.append(script)
    }
    return () => { cancelled = true }
  }, [googleClientId, location.state, navigate, signInWithGoogle])

  if (user) return <Navigate to="/" replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      await signIn({ email, password })
      const requestedPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/'
      navigate(requestedPath, { replace: true })
    } catch {
      setError('E-mail ou senha inválidos. Confira os dados e tente novamente.')
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
          <p>{googleClientId ? 'Entre com a conta Google autorizada para continuar.' : 'Use seu acesso da equipe para continuar.'}</p>
        </div>

        {googleClientId ? <div className="login-form">
          <div ref={googleButton} className="google-signin-button" />
          {isSubmitting && <p role="status">Verificando seu acesso…</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </div> : <form onSubmit={handleSubmit} className="login-form">
          {passwordChanged && (
            <p className="form-success" role="status">
              Senha alterada. Entre novamente com a nova senha.
            </p>
          )}
          <label>
            <span>E-mail</span>
            <input
              type="email"
              name="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="seuemail@exemplo.com"
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
        </form>}
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
