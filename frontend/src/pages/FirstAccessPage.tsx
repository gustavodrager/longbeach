import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSignInOptions } from '../features/auth/authApi'
import { Navigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { useAuth } from '../features/auth/authContext'
import { GoogleSignInButton } from '../features/auth/GoogleSignInButton'
import { passwordRequirementError } from './AccountPage'
import './auth-entry.css'

export function FirstAccessPage() {
  const { user, isBootstrapping, changePassword, completeFirstAccessWithGoogle, signOut } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState<'password' | 'google' | null>(null)
  const busy = saving !== null
  const options = useQuery({ queryKey: ['sign-in-options'], queryFn: getSignInOptions, retry: false, staleTime: 0 })
  const googleClientId = !options.isError ? options.data?.googleClientId : null
  const googleEnabled = Boolean(googleClientId)

  if (isBootstrapping) return <main className="session-loading" role="status">Carregando seu acesso…</main>
  if (!user) return <Navigate to="/login" replace />
  if (!user.requiresFirstAccess) return <Navigate to="/" replace />

  async function savePassword(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const problem = passwordRequirementError(newPassword)
    if (problem) { setError(problem); return }
    if (newPassword !== confirmation) { setError('A confirmação não corresponde à nova senha.'); return }
    if (newPassword === currentPassword) { setError('Escolha uma senha diferente da inicial.'); return }
    setError(''); setSaving('password')
    try { await changePassword({ currentPassword, newPassword }) }
    catch { setError('Não foi possível salvar. Confira a senha inicial ou entre novamente se o acesso expirou.') }
    finally { setSaving(null) }
  }

  async function linkGoogle(credential: string) {
    if (busy) return
    setError(''); setSaving('google')
    try { await completeFirstAccessWithGoogle(credential) }
    catch { setError('Não foi possível vincular essa conta. Ela pode já estar em uso. Tente novamente ou escolha uma nova senha.') }
    finally { setSaving(null) }
  }

  return <main className="auth-entry-page first-access-entry"><section className="auth-entry-panel" aria-labelledby="first-access-title">
    <div className="auth-entry-brand"><Logo showTagline={false} /></div>
    <div className="auth-entry-heading"><h1 id="first-access-title">Concluir acesso</h1>
      <p className="auth-entry-account">{user.username ? <>Usuário: <strong>{user.username}</strong></> : <strong>{user.name}</strong>}</p></div>
    {googleEnabled && <section className="auth-entry-google" aria-label="Vincular Google">
      <GoogleSignInButton clientId={googleClientId ?? ''} onCredential={credential => void linkGoogle(credential)} onError={setError} disabled={busy} />
      <p className="auth-entry-note">Use esta conta nos próximos acessos.</p></section>}
    {options.isPending && <p className="auth-entry-status" role="status">Consultando acesso Google…</p>}
    {options.isError && <p className="auth-entry-status" role="status">Não foi possível consultar o Google. <button className="text-button" type="button" disabled={busy} onClick={() => void options.refetch()}>Tentar novamente</button></p>}
    {options.isSuccess && !googleEnabled && <p className="auth-entry-status" role="status">Google indisponível. Você pode criar uma senha.</p>}
    <details className="auth-entry-password">
      <summary>Criar senha</summary>
      <form className="auth-entry-form" onSubmit={savePassword}>
        <label><span>Senha inicial</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} maxLength={256} disabled={busy} required /></label>
        <label><span>Nova senha</span><input type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} minLength={14} maxLength={256} aria-describedby="first-access-password-help" disabled={busy} required /></label>
        <p className="field-help" id="first-access-password-help">Use 14 ou mais caracteres, com letra maiúscula, minúscula, número e símbolo.</p>
        <label><span>Confirmar nova senha</span><input type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} minLength={14} maxLength={256} disabled={busy} required /></label>
        <button className="primary-button" type="submit" disabled={busy}>{saving === 'password' ? 'Salvando…' : 'Salvar nova senha'}</button>
      </form>
    </details>
    {busy && <p className="auth-entry-status" role="status">Salvando acesso…</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="auth-entry-note">A senha inicial deixa de funcionar ao concluir esta etapa.</p>
    <button type="button" className="auth-entry-exit text-button" disabled={busy} onClick={() => void signOut()}>Sair</button>
  </section></main>
}
