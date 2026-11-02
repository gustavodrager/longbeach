import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/authContext'
import { getSignInOptions } from '../features/auth/authApi'
import { GoogleSignInButton } from '../features/auth/GoogleSignInButton'
import { passwordRequirementError } from '../features/auth/passwordRequirements'
import { apiFetch } from '../lib/http'
import './administration-clean.css'

export { passwordRequirementError } from '../features/auth/passwordRequirements'
type AuthMethods = { username: string | null; googleLinked: boolean; localPasswordEnabled: boolean }
export function AccountPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState<string | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const owner = user ? `${user.id}:${user.roles.join(',')}:${user.permissions.join(',')}` : 'signed-out'
  const session = useRef({ owner })
  if (session.current.owner !== owner) session.current = { owner }
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { lock.current = false; setBusy(false); setError(''); setCurrentPassword(''); setNewPassword(''); setConfirmation(''); setUsername(null) }, [owner])
  const methods = useQuery({ queryKey: ['auth-methods', user?.id], queryFn: () => apiFetch<AuthMethods>('/api/v1/me/auth-methods'), enabled: Boolean(user), retry: false, staleTime: 0 })
  const options = useQuery({ queryKey: ['sign-in-options'], queryFn: getSignInOptions, enabled: Boolean(user), retry: false, staleTime: 0 })
  const current = methods.data && typeof methods.data.googleLinked === 'boolean' && typeof methods.data.localPasswordEnabled === 'boolean' ? methods.data : null
  const googleLinked = current?.googleLinked ?? Boolean(user?.googleLinked)
  const googleClientId = !options.isError ? options.data?.googleClientId : null
  const localEnabled = !options.isError && options.data?.localLoginEnabled === true
  const effectiveUsername = username ?? current?.username ?? user?.username ?? ''
  async function update(action: 'password' | 'google', credential?: string) {
    if (lock.current || !current) return
    if (action === 'password' && !localEnabled) return
    if (action === 'password') {
      const problem = passwordRequirementError(newPassword)
      if (problem) { setError(problem); return }
      if (!/^[a-z][a-z0-9._-]{2,63}$/.test(effectiveUsername.trim().toLowerCase())) { setError('Use um usuário de 3 a 64 caracteres, começando com letra, sem espaços ou acentos.'); return }
      if (newPassword !== confirmation) { setError('A confirmação não corresponde à nova senha.'); return }
      if (newPassword === currentPassword) { setError('A nova senha precisa ser diferente da senha atual.'); return }
    }
    if (!credential && !currentPassword) { setError('Confirme com sua senha atual ou com o Google vinculado.'); return }
    lock.current = true; setBusy(true); setError('')
    const started = session.current
    const active = () => mounted.current && session.current === started
    try {
      await apiFetch<void>('/api/v1/me/auth-methods', {
        method: 'PUT', headers: credential ? { 'X-Google-Id-Token': credential } : undefined,
        body: JSON.stringify({ action, currentPassword: currentPassword || null, ...(action === 'password' ? { username: effectiveUsername.trim(), newPassword } : {}) }),
      })
      if (!active()) return
      setCurrentPassword(''); setNewPassword(''); setConfirmation('')
      await signOut().catch(() => undefined)
      navigate('/login', { replace: true, state: { passwordChanged: true } })
    } catch (cause) { if (active()) setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o acesso.') }
    finally { if (active()) { lock.current = false; setBusy(false) } }
  }
  function savePassword(event: FormEvent) { event.preventDefault(); void update('password') }
  async function exit() { await signOut().catch(() => undefined); navigate('/login', { replace: true }) }
  return <main className="account-page administration-clean">
    <header className="account-heading"><div><h1>Segurança</h1><p>{user?.name} · {user?.email || user?.username}</p></div><div className="account-actions"><Link to="/" className="secondary-link">Voltar ao início</Link><button type="button" className="text-button" onClick={() => void exit()}>Sair</button></div></header>
    {methods.isPending && <p role="status">Consultando formas de acesso…</p>}
    {methods.isError && <p role="alert">Não foi possível consultar sua conta. <button className="text-button" type="button" onClick={() => void methods.refetch()}>Tentar novamente</button></p>}
    <section className="account-card"><h2>Formas de acesso</h2>{current && <><p>Usuário: <strong>{current.username || 'Ainda não definido'}</strong></p><p>{current.localPasswordEnabled ? 'Senha habilitada.' : 'Sem senha local.'}</p></>}{googleLinked && <div className="account-card-copy"><h3>Acesso pelo Google</h3><p>Google vinculado à sua conta.</p><a className="secondary-link" href="https://myaccount.google.com/security" target="_blank" rel="noreferrer">Gerenciar segurança no Google (nova aba)</a></div>}</section>
    {current && <>
      {localEnabled && <details className="account-card"><summary>{current.localPasswordEnabled ? 'Alterar senha' : 'Adicionar usuário e senha'}</summary>
        <form className="account-form" onSubmit={savePassword}><fieldset disabled={busy}>
          <label>Usuário<input required minLength={3} maxLength={64} autoComplete="username" autoCapitalize="none" spellCheck={false} value={effectiveUsername} onChange={event => setUsername(event.target.value)} /></label>
          <label>Nova senha<input required type="password" autoComplete="new-password" minLength={14} maxLength={256} aria-describedby="security-password-help" value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label>
          <p className="field-help" id="security-password-help">Use 14 ou mais caracteres, com maiúscula, minúscula, número e símbolo.</p>
          <label>Confirmar nova senha<input required type="password" autoComplete="new-password" minLength={14} maxLength={256} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
          {current.localPasswordEnabled && <><label>Senha atual<input type="password" autoComplete="current-password" maxLength={256} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label><button className="primary-button" disabled={busy} type="submit">Salvar com a senha atual</button></>}
        </fieldset></form>
        {current.googleLinked && googleClientId && <div className="account-google-confirm"><p>Confirmar com o Google vinculado:</p><GoogleSignInButton clientId={googleClientId} onCredential={credential => void update('password', credential)} onError={setError} disabled={busy} /></div>}
        {!current.localPasswordEnabled && !googleClientId && <p role="status">Google indisponível. Tente novamente mais tarde ou peça ajuda à equipe.</p>}
        <p>Salvar encerra os acessos atuais. Entre novamente para continuar.</p>
      </details>}
      {!current.googleLinked && <details className="account-card"><summary>Vincular Google</summary><p>Confirme a senha atual e escolha sua conta Google.</p><label className="operation-field">Senha atual para vincular Google<input type="password" autoComplete="current-password" maxLength={256} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} disabled={busy} /></label>{googleClientId ? <div className="account-google-confirm"><GoogleSignInButton clientId={googleClientId} onCredential={credential => void update('google', credential)} onError={setError} disabled={busy || !currentPassword} /></div> : <p role="status">Google indisponível no momento.</p>}<p>O vínculo mantém seu usuário e sua senha. Você entrará novamente após salvar.</p></details>}
    </>}
    {busy && <p role="status">Atualizando acesso…</p>}{error && <p className="form-error" role="alert">{error}</p>}
    <details className="account-card"><summary>Recuperar acesso</summary><p>Peça à equipe um link de recuperação após confirmar sua identidade.</p></details>
  </main>
}
