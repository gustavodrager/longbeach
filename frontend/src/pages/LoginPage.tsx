import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSignInOptions, registerClient } from '../features/auth/authApi'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { useAuth } from '../features/auth/authContext'
import { GoogleSignInButton } from '../features/auth/GoogleSignInButton'
import { CredentialFields, credentialsProblem, type CredentialsDraft } from '../features/auth/CredentialFields'
import { loginDestination } from '../features/auth/loginDestination'
import './auth-entry.css'

export function LoginPage() {
  const { user, isBootstrapping, signInWithGoogle, signIn } = useAuth()
  const location = useLocation()
  const [params] = useSearchParams()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [emailExpanded, setEmailExpanded] = useState(false)
  const [draft, setDraft] = useState<CredentialsDraft>({ username: '', password: '', confirmation: '' })
  const [method, setMethod] = useState<'google' | 'local'>('google')
  const [contactConfirmed, setContactConfirmed] = useState(false)
  const [created, setCreated] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const lock = useRef(false)
  const title = useRef<HTMLHeadingElement>(null)
  const contactName = useRef<HTMLInputElement>(null)
  const contactPhone = useRef<HTMLInputElement>(null)
  const emailDetails = useRef<HTMLDetailsElement>(null)
  const returningToContact = useRef(false)
  const options = useQuery({ queryKey: ['sign-in-options'], queryFn: getSignInOptions, retry: false, staleTime: 0 })
  const googleClientId = !options.isError ? options.data?.googleClientId : null
  const googleRegistration = Boolean(googleClientId && options.data?.clientRegistrationEnabled)
  const localRegistration = !options.isError && options.data?.localRegistrationEnabled === true
  const registrationEnabled = googleRegistration || localRegistration
  const registrationRequested = params.get('cadastro') === 'cliente'
  const registering = registrationRequested && registrationEnabled && !created
  const homologation = !options.isError && options.data?.homologationLoginEnabled === true
  const localLogin = !options.isError && (options.data?.localLoginEnabled === true || homologation)
  const localSelected = registering && localRegistration && (method === 'local' || !googleRegistration)
  const choosingAccess = registering && contactConfirmed
  useEffect(() => {
    if (!registering) return
    if (contactConfirmed) title.current?.focus()
    else if (returningToContact.current) { contactName.current?.focus(); returningToContact.current = false }
  }, [registering, contactConfirmed])
  if (user) return <Navigate to={loginDestination(user, location.state?.from)} replace />

  const contactProblem = () => !name.trim() ? 'Informe seu nome.' : !/^\d{10,15}$/.test(phone) ? 'Informe um telefone válido com DDD.' : null
  function confirmContact(event: FormEvent) {
    event.preventDefault()
    if (lock.current || isBootstrapping) return
    const problem = contactProblem()
    if (problem) { setError(problem); (name.trim() ? contactPhone : contactName).current?.focus(); return }
    setError(''); setEmailExpanded(Boolean(email)); setContactConfirmed(true)
  }
  function editContact() {
    returningToContact.current = true; setContactConfirmed(false); setError('')
  }
  async function run(work: () => Promise<void>, fallback: string) {
    if (lock.current || isBootstrapping) return
    lock.current = true; setError(''); setIsSubmitting(true)
    try { await work() }
    catch (cause) { setError(cause instanceof Error ? cause.message : fallback) }
    finally { lock.current = false; setIsSubmitting(false) }
  }
  async function handleGoogle(credential: string) {
    if (registering) {
      if (!contactConfirmed) return
      const problem = contactProblem()
      if (problem) { setError(problem); return }
      if (!googleRegistration) return
    }
    await run(async () => {
      if (registering) await signInWithGoogle(credential, { name: name.trim(), phone })
      else await signInWithGoogle(credential)
    }, 'Não foi possível entrar com o Google. Tente novamente.')
  }
  async function handleLocal(event: FormEvent) {
    event.preventDefault()
    if (!localLogin) return
    await run(async () => {
      try { await signIn({ email: identifier.trim(), password }) }
      catch { throw new Error(homologation ? 'Não foi possível entrar. Confira o acesso de teste fornecido pela Long Beach.' : 'Não foi possível entrar. Confira seu usuário e sua senha.') }
      finally { setPassword('') }
    }, 'Não foi possível entrar.')
  }
  async function handleRegistration(event: FormEvent) {
    event.preventDefault()
    if (!localRegistration || !contactConfirmed) return
    const problem = contactProblem() ?? credentialsProblem(draft)
    if (problem) { setError(problem); return }
    await run(async () => {
      await registerClient({ name: name.trim(), phone, email: email.trim() || null, username: draft.username.trim(), password: draft.password })
      setIdentifier(draft.username.trim()); setDraft({ username: '', password: '', confirmation: '' }); setCreated(true)
    }, 'Não foi possível criar a conta.')
  }

  return <main className="auth-entry-page"><section className="auth-entry-panel" aria-labelledby="login-title">
    <div className="auth-entry-brand"><Logo showTagline={false} /></div>
    <div className="auth-entry-heading"><h1 ref={title} tabIndex={choosingAccess ? -1 : undefined} id="login-title">{choosingAccess && googleRegistration && localRegistration ? 'Como quer entrar?' : registering ? 'Criar conta' : homologation ? 'Entrar na homologação' : 'Entrar'}</h1></div>
    {homologation && <p className="auth-entry-test">Ambiente de teste: dados fictícios e pagamentos Sandbox.</p>}
    {created && <p className="auth-entry-status" role="status">Conta criada. Entre com seu usuário e sua senha.</p>}
    {registering && !contactConfirmed && <form className="auth-entry-form" noValidate onSubmit={confirmContact}>
      <label>Nome<input ref={contactName} required autoComplete="name" maxLength={240} value={name} onChange={event => setName(event.target.value)} disabled={isSubmitting} /></label>
      <label>Telefone com DDD<input ref={contactPhone} required type="tel" autoComplete="tel-national" inputMode="tel" maxLength={30} value={phone} onChange={event => setPhone(event.target.value.replace(/\D/g, ''))} disabled={isSubmitting} /></label>
      <button className="primary-button" type="submit" disabled={isSubmitting || isBootstrapping}>Continuar</button>
    </form>}
    {choosingAccess && <div className="auth-entry-contact"><p className="auth-entry-note">{name.trim()} · {phone}</p><button className="text-button" type="button" disabled={isSubmitting} onClick={editContact}>Alterar dados</button></div>}
    {googleClientId && !localSelected && (!registering || choosingAccess) && <div className="auth-entry-google"><GoogleSignInButton clientId={googleClientId} onCredential={credential => void handleGoogle(credential)} onError={setError} disabled={isSubmitting || isBootstrapping} /></div>}
    {googleRegistration && !localSelected && !created && (!registering || choosingAccess) && <p className="auth-entry-note">{registering ? 'Ao continuar, criaremos sua conta de cliente.' : 'Se ainda não tiver cadastro, criaremos sua conta de cliente.'}</p>}
    {choosingAccess && localRegistration && !localSelected && <button className="auth-entry-secondary" type="button" disabled={isSubmitting} onClick={() => { setMethod('local'); setEmailExpanded(Boolean(email)); setError('') }}>Usar usuário e senha</button>}
    {choosingAccess && localSelected && <form className="auth-entry-form" onSubmit={event => void handleRegistration(event)}>
      <CredentialFields value={draft} onChange={setDraft} disabled={isSubmitting} />
      <details ref={emailDetails} className="auth-entry-help" open={emailExpanded} onToggle={event => setEmailExpanded(event.currentTarget.open)}><summary>Adicionar e-mail (opcional)</summary>
        <label>E-mail de contato (opcional)<input type="email" autoComplete="email" maxLength={240} value={email} onChange={event => setEmail(event.target.value)} onInvalid={() => { if (emailDetails.current) emailDetails.current.open = true; setEmailExpanded(true) }} disabled={isSubmitting} /></label>
      </details>
      <button className="primary-button" type="submit" disabled={isSubmitting || isBootstrapping}>Criar conta</button>
      {googleRegistration && <button className="text-button" type="button" disabled={isSubmitting} onClick={() => { setMethod('google'); setError('') }}>Usar Google</button>}
    </form>}
    {!registering && localLogin && <details className="auth-entry-password" open={!googleClientId || created || undefined}>
      <summary>{homologation ? 'Acesso de teste' : 'Entrar com usuário e senha'}</summary>
      <form className="auth-entry-form" onSubmit={event => void handleLocal(event)}>
        <label>{homologation ? 'E-mail de teste' : 'Usuário ou e-mail'}<input type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={240} value={identifier} onChange={event => setIdentifier(event.target.value)} disabled={isSubmitting} /></label>
        <label>{homologation ? 'Senha de teste' : 'Senha'}<input type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={event => setPassword(event.target.value)} disabled={isSubmitting} /></label>
        <button className="primary-button" type="submit" disabled={isSubmitting || isBootstrapping}>{homologation ? 'Entrar na homologação' : 'Entrar'}</button>
      </form>
    </details>}
    {registrationRequested && options.isSuccess && !registrationEnabled && <p className="auth-entry-status" role="status">O cadastro online está indisponível. Fale com a equipe.</p>}
    {options.isPending && <p className="auth-entry-status" role="status">Carregando opções de acesso…</p>}
    {options.isError && <p className="auth-entry-status" role="alert">Não foi possível consultar as opções de acesso. <button className="text-button" type="button" onClick={() => void options.refetch()}>Tentar novamente</button></p>}
    {!registering && options.isSuccess && !googleClientId && !localLogin && <p className="auth-entry-status" role="alert">O acesso está indisponível. <button className="text-button" type="button" onClick={() => void options.refetch()}>Tentar novamente</button></p>}
    {isSubmitting && <p className="auth-entry-status" role="status">{registering ? 'Criando conta…' : homologation || localLogin ? 'Entrando…' : 'Entrando com Google…'}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {registrationEnabled && <nav className="auth-entry-actions" aria-label="Opções de conta">{registering ? <Link className="auth-entry-secondary" to="/login" state={location.state}>Já tenho conta</Link> : <Link className="auth-entry-secondary" to="/login?cadastro=cliente" state={location.state} onClick={() => { setCreated(false); setContactConfirmed(false); setError('') }}>Criar conta</Link>}</nav>}
    {!homologation && <details className="auth-entry-help"><summary>Precisa de ajuda?</summary>
      {googleClientId && <p><a href="https://accounts.google.com/signin/recovery" target="_blank" rel="noreferrer">Recuperar conta Google</a>.</p>}
      <p>Esqueceu o usuário ou a senha? Peça à equipe um link de recuperação após confirmar sua identidade.</p>
      <p>Para vincular aulas, reservas e pagamentos, fale com a equipe.</p>
    </details>}
    <Link className="auth-entry-back" to="/visitante" state={location.state}>Voltar à entrada</Link>
  </section></main>
}
