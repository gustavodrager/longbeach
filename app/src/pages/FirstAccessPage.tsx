import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { useAuth } from '../features/auth/authContext'
import { GoogleSignInButton } from '../features/auth/GoogleSignInButton'
import { passwordRequirementError } from './AccountPage'

export function FirstAccessPage() {
  const { user, isBootstrapping, changePassword, completeFirstAccessWithGoogle, signOut } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const googleEnabled = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID)

  if (isBootstrapping) return <main className="session-loading">Carregando seu acesso…</main>
  if (!user) return <Navigate to="/login" replace />
  if (!user.requiresFirstAccess) return <Navigate to="/" replace />

  async function savePassword(event: FormEvent) {
    event.preventDefault()
    const problem = passwordRequirementError(newPassword)
    if (problem) { setError(problem); return }
    if (newPassword !== confirmation) { setError('A confirmação não corresponde à nova senha.'); return }
    if (newPassword === currentPassword) { setError('Escolha uma senha diferente da inicial.'); return }
    setError(''); setBusy(true)
    try { await changePassword({ currentPassword, newPassword }) }
    catch { setError('Não foi possível salvar. Confira a senha inicial ou entre novamente se o acesso expirou.') }
    finally { setBusy(false) }
  }

  async function linkGoogle(credential: string) {
    setError(''); setBusy(true)
    try { await completeFirstAccessWithGoogle(credential) }
    catch { setError('Não foi possível vincular essa conta. Ela pode já estar em uso. Tente novamente ou escolha uma nova senha.') }
    finally { setBusy(false) }
  }

  return <main className="login-page first-access-page"><section className="login-panel" aria-labelledby="first-access-title">
    <div className="login-brand"><Logo /></div>
    <div className="login-heading"><p className="eyebrow">Primeiro acesso</p><h1 id="first-access-title">Olá, {user.name}</h1>
      <p>Seu usuário é <strong>{user.username}</strong>. {googleEnabled ? 'Vincule seu Google ou escolha uma nova senha para acessar a arena.' : 'Escolha uma nova senha para acessar a arena.'}</p></div>
    {googleEnabled && <section className="first-access-google" aria-label="Vincular Google"><h2>Usar minha conta Google</h2>
      <p>Escolha sua conta pessoal. Nos próximos acessos, use o botão do Google.</p>
      <GoogleSignInButton onCredential={credential => void linkGoogle(credential)} onError={setError} disabled={busy} />
      <p className="login-divider">ou crie sua senha</p></section>}
    <form className="login-form" onSubmit={savePassword}>
      <label><span>Senha inicial</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} maxLength={256} required /></label>
      <label><span>Nova senha</span><input type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} minLength={14} maxLength={256} aria-describedby="first-access-password-help" required /></label>
      <p className="field-help" id="first-access-password-help">Use 14 ou mais caracteres, com letra maiúscula, minúscula, número e símbolo.</p>
      <label><span>Confirmar nova senha</span><input type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} minLength={14} maxLength={256} required /></label>
      <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar nova senha'}</button>
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="login-footnote">A senha inicial deixa de funcionar ao concluir esta etapa.</p>
    <button type="button" className="text-button" disabled={busy} onClick={() => void signOut()}>Sair</button>
  </section></main>
}
