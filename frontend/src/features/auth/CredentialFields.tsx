import { passwordRequirementError } from './passwordRequirements'

export type CredentialsDraft = { username: string; password: string; confirmation: string }
export function credentialsProblem(draft: CredentialsDraft) {
  if (!/^[a-z][a-z0-9._-]{2,63}$/.test(draft.username.trim().toLowerCase())) return 'Use um usuário de 3 a 64 caracteres, começando com letra, sem espaços ou acentos.'
  const problem = passwordRequirementError(draft.password)
  if (problem) return problem
  return draft.password === draft.confirmation ? null : 'A confirmação não corresponde à senha.'
}
export function CredentialFields({ value, onChange, disabled = false, current = false }: { value: CredentialsDraft; onChange: (next: CredentialsDraft) => void; disabled?: boolean; current?: boolean }) {
  return <>
    <label>Usuário<input required autoComplete="username" minLength={3} maxLength={64} placeholder="Ex.: maria.silva" disabled={disabled} value={value.username} onChange={event => onChange({ ...value, username: event.target.value })} autoCapitalize="none" spellCheck={false} /></label>
    <label>{current ? 'Senha' : 'Criar senha'}<input required type="password" autoComplete={current ? 'current-password' : 'new-password'} minLength={current ? undefined : 14} maxLength={256} disabled={disabled} value={value.password} onChange={event => onChange({ ...value, password: event.target.value })} aria-describedby={current ? undefined : 'new-access-password-help'} /></label>
    {!current && <><p className="field-help" id="new-access-password-help">Use 14 ou mais caracteres, com maiúscula, minúscula, número e símbolo.</p><label>Confirmar senha<input required type="password" autoComplete="new-password" minLength={14} maxLength={256} disabled={disabled} value={value.confirmation} onChange={event => onChange({ ...value, confirmation: event.target.value })} /></label></>}
  </>
}
