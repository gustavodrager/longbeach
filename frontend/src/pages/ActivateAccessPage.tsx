import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { getSignInOptions, publicAuthRequest } from '../features/auth/authApi'
import { useAuth } from '../features/auth/authContext'
import { CredentialFields, credentialsProblem, type CredentialsDraft } from '../features/auth/CredentialFields'
import { GoogleSignInButton } from '../features/auth/GoogleSignInButton'
import { ApiError } from '../lib/http'
import './auth-entry.css'

type Inspection = { purpose: 'Activation' | 'Recovery'; expiresAtUtc: string }
export function ActivateAccessPage({ recovery = false }: { recovery?: boolean }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, isBootstrapping, signOut } = useAuth()
  const [token, setToken] = useState(() => new URLSearchParams(location.hash.replace(/^#/, '')).get('token') ?? '')
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [canRetry, setCanRetry] = useState(false)
  const [generation, setGeneration] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [complete, setComplete] = useState(false)
  const [draft, setDraft] = useState<CredentialsDraft>({ username: '', password: '', confirmation: '' })
  const lock = useRef(false)
  const owner = user ? `${user.id}:${user.roles.join(',')}` : 'signed-out'
  const session = useRef({ owner })
  if (session.current.owner !== owner) session.current = { owner }
  const mounted = useRef(true)
  const tokenGeneration = useRef(0)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const options = useQuery({ queryKey: ['sign-in-options'], queryFn: getSignInOptions, retry: false, staleTime: 0 })
  const googleClientId = !options.isError ? options.data?.googleClientId : null
  const localEnabled = !options.isError && options.data?.localLoginEnabled === true
  useEffect(() => {
    if (!location.hash) return
    tokenGeneration.current++
    setGeneration(tokenGeneration.current)
    setToken(new URLSearchParams(location.hash.replace(/^#/, '')).get('token') ?? '')
    setInspection(null); setComplete(false); setError(''); setCanRetry(false); setLoading(true); setBusy(false)
    setDraft({ username: '', password: '', confirmation: '' }); lock.current = false
    navigate({ pathname: location.pathname, search: location.search, hash: '' }, { replace: true, state: null })
  }, [location.hash, location.pathname, location.search, navigate])
  useEffect(() => {
    let active = true
    if (location.hash) return
    if (complete) return
    if (!token || token.length > 2048) { setLoading(false); setError('Link inválido. Peça um novo link à equipe.'); return }
    setLoading(true); setCanRetry(false)
    void publicAuthRequest<Inspection>('/access/inspect', { token }).then(value => {
      if (!active) return
      if (value.purpose !== (recovery ? 'Recovery' : 'Activation') || !Number.isFinite(Date.parse(value.expiresAtUtc)) || Date.parse(value.expiresAtUtc) <= Date.now()) throw new Error('Link inválido ou expirado. Peça um novo link à equipe.')
      setInspection(value)
    }).catch(cause => { if (active) { setError(cause instanceof Error ? cause.message : 'Não foi possível conferir o link.'); setCanRetry(!(cause instanceof ApiError) || cause.status >= 500 || cause.status === 429) } }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token, recovery, complete, attempt, generation, location.hash])
  async function submit(googleCredential?: string) {
    if (lock.current || !inspection || complete || isBootstrapping) return
    if (!googleCredential && !localEnabled) return
    if (!googleCredential) { const problem = credentialsProblem(draft); if (problem) { setError(problem); return } }
    lock.current = true; setBusy(true); setError('')
    const started = session.current
    const startedGeneration = tokenGeneration.current
    const active = () => mounted.current && session.current === started && tokenGeneration.current === startedGeneration
    try {
      await publicAuthRequest<void>(recovery ? '/access/recover' : googleCredential ? '/access/activate/google' : '/access/activate', googleCredential ? { token } : { token, username: draft.username.trim(), password: draft.password }, googleCredential)
      if (!active()) return
      setToken(''); setInspection(null); setDraft({ username: '', password: '', confirmation: '' }); setComplete(true); setBusy(false)
      await signOut().catch(() => undefined)
    } catch (cause) { if (active()) setError(cause instanceof Error ? cause.message : 'Não foi possível concluir o acesso.') }
    finally { if (active()) { lock.current = false; setBusy(false) } }
  }
  function save(event: FormEvent) { event.preventDefault(); void submit() }
  return <main className="auth-entry-page"><section className="auth-entry-panel" aria-labelledby="activate-title">
    <div className="auth-entry-brand"><Logo showTagline={false} /></div>
    <div className="auth-entry-heading"><h1 id="activate-title">{complete ? 'Acesso pronto' : recovery ? 'Recuperar acesso' : 'Ativar minha conta'}</h1></div>
    {loading && <p role="status">Conferindo seu link…</p>}
    {complete ? <><p className="auth-entry-note" role="status">{recovery ? 'Seu acesso foi recuperado. Entre novamente.' : 'Sua conta está pronta. Entre para acessar sua área.'}</p><Link className="auth-entry-secondary" to="/login">Entrar</Link></> : inspection && <>
      <p className="auth-entry-note">{recovery ? 'Escolha seu usuário e uma nova senha. Os acessos anteriores serão encerrados.' : 'Escolha como entrar na sua conta.'}</p>
      {!recovery && googleClientId && <div className="auth-entry-google"><GoogleSignInButton clientId={googleClientId} onCredential={credential => void submit(credential)} onError={setError} disabled={busy || isBootstrapping} /></div>}
      {localEnabled && <details className="auth-entry-password" open={recovery || !googleClientId || undefined}><summary>{recovery ? 'Definir novo acesso' : 'Usar usuário e senha'}</summary><form className="auth-entry-form" onSubmit={save}>
        <CredentialFields value={draft} onChange={setDraft} disabled={busy} /><button className="primary-button" disabled={busy || isBootstrapping} type="submit">{recovery ? 'Recuperar acesso' : 'Ativar conta'}</button>
      </form></details>}
      {options.isPending && <p role="status">Consultando formas de acesso…</p>}
      {options.isSuccess && !localEnabled && (recovery || !googleClientId) && <p role="status">O acesso com usuário e senha está indisponível. Peça ajuda à equipe.</p>}
      {options.isError && <p role="alert">Não foi possível consultar as formas de acesso. <button className="text-button" type="button" onClick={() => void options.refetch()}>Consultar formas de acesso</button></p>}
      <p className="auth-entry-note">Link válido até {new Date(inspection.expiresAtUtc).toLocaleString('pt-BR')}.</p>
    </>}
    {busy && <p role="status">Salvando acesso…</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {canRetry && !loading && !inspection && <button className="auth-entry-secondary" type="button" onClick={() => { setError(''); setAttempt(value => value + 1) }}>Tentar novamente</button>}
    {!complete && <Link className="auth-entry-back" to="/login">Voltar para entrar</Link>}
  </section></main>
}
