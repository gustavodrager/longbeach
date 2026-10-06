import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/authContext'

const minimumPasswordLength = 14

export function passwordRequirementError(password: string) {
  if (password.length < minimumPasswordLength) {
    return `A nova senha precisa ter pelo menos ${minimumPasswordLength} caracteres.`
  }
  if (
    !/\p{Ll}/u.test(password) ||
    !/\p{Lu}/u.test(password) ||
    !/\p{Nd}/u.test(password) ||
    !/[^\p{L}\p{N}]/u.test(password)
  ) {
    return 'Use letra maiúscula, letra minúscula, número e símbolo na nova senha.'
  }
  return null
}

export function AccountPage() {
  const { user, changePassword, signOut } = useAuth()
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    const requirementError = passwordRequirementError(newPassword)
    if (requirementError) {
      setError(requirementError)
      return
    }
    if (newPassword !== confirmation) {
      setError('A confirmação não corresponde à nova senha.')
      return
    }
    if (currentPassword === newPassword) {
      setError('A nova senha precisa ser diferente da senha atual.')
      return
    }

    setIsSubmitting(true)
    try {
      await changePassword({ currentPassword, newPassword })
      navigate('/login', { replace: true, state: { passwordChanged: true } })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível alterar a senha.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <main className="account-page">
      <header className="account-heading">
        <div>
          <p className="eyebrow">Sua conta</p>
          <h1>Segurança</h1>
          <p>{user?.name} · {user?.email || user?.username}</p>
        </div>
        <div className="account-actions">
          <Link to="/" className="secondary-link">Voltar ao início</Link>
          <button type="button" className="text-button" onClick={() => void handleSignOut()}>Sair</button>
        </div>
      </header>

      <section className="account-card" aria-labelledby="change-password-title">
        <div className="account-card-copy">
          <h2 id="change-password-title">Alterar senha</h2>
          <p>
            Depois da alteração, nenhuma sessão poderá ser renovada e este acesso será encerrado.
            Você entrará novamente com a nova senha.
          </p>
        </div>

        <form className="account-form" onSubmit={handleSubmit}>
          <label>
            <span>Senha atual</span>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              maxLength={256}
              required
            />
          </label>
          <label>
            <span>Nova senha</span>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={minimumPasswordLength}
              maxLength={256}
              aria-describedby="password-help"
              required
            />
          </label>
          <p id="password-help" className="field-help">
            Use 14 ou mais caracteres, com letra maiúscula, minúscula, número e símbolo.
          </p>
          <label>
            <span>Confirmar nova senha</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              minLength={minimumPasswordLength}
              maxLength={256}
              required
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Alterando…' : 'Alterar senha'}
          </button>
        </form>
      </section>
    </main>
  )
}
