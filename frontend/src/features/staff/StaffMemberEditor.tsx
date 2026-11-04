import { useEffect, useRef, useState, type FormEvent } from 'react'
import { EditorPanel, useUnsavedChanges } from '../../components/managementUi'
import { ApiError } from '../../lib/http'
import { Disclosure } from '../../components/managementUi'
import { Field, Group, SaveRow } from '../../pages/arenaUi'
import type { TeamMember } from '../operations/DemoDataProvider'
import { getStaffAccess, saveStaffMember, staffError, type StaffAccessStatus, type StaffAccount, type StaffContext, type StaffMemberInput, type StaffMemberResult } from './api'

type Props = { member: Omit<TeamMember, 'id'>; teamId: string; existing: boolean; context: StaffContext; status?: StaffAccessStatus; canEditCosts: boolean; onClose: () => void; onSaved: (result: StaffMemberResult, secretUnavailable?: boolean) => Promise<void> }

export function StaffMemberEditor({ member, teamId, existing, context, status: suppliedStatus, canEditCosts, onClose, onSaved }: Props) {
  const status = useRef(suppliedStatus).current
  const [person, setPerson] = useState(member)
  const [mode, setMode] = useState<'create' | 'link' | 'keep' | 'none'>(status?.userId ? 'keep' : existing ? 'none' : 'create')
  const [typeId, setTypeId] = useState(status?.typeId ?? '')
  const [userId, setUserId] = useState(status?.userId ?? '')
  const [entry, setEntry] = useState<'phone' | 'username' | 'existing'>(status?.userId ? 'existing' : 'phone')
  const [phoneLogin, setPhoneLogin] = useState(status?.phoneLogin ?? '')
  const [phoneEdited, setPhoneEdited] = useState(Boolean(status?.phoneLogin))
  const [username, setUsername] = useState(status?.username ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState<StaffMemberInput | null>(null)
  const locked = useRef(false)
  const mounted = useRef(true)
  const { markSaved } = useUnsavedChanges()
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const type = context.types.find(item => item.id === typeId)
  const compatible = context.accounts.filter(account => account.isActive && account.role === type?.role && (!account.linkedTeamId || account.linkedTeamId === teamId))
  const selectedAccount = context.accounts.find(account => account.id === userId)
  const frozen = busy || Boolean(attempt)
  const loginPhone = phoneEdited ? phoneLogin : person.phone
  const owner = status?.isOwner === true
  function changeMode(next: typeof mode) { setMode(next); setUserId(''); setEntry(next === 'create' ? 'phone' : 'existing') }
  function chooseAccount(id: string) { setUserId(id); setEntry('existing'); const account = context.accounts.find(item => item.id === id); setPhoneLogin(account?.phoneLogin ?? ''); setUsername(account?.username ?? '') }
  async function finish(result: StaffMemberResult, secretUnavailable = false) {
    if (!mounted.current) return
    markSaved(); await onSaved(result, secretUnavailable)
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (locked.current || mode !== 'none' && !type || mode === 'link' && !userId) return
    const request = attempt ?? {
      member: { ...person, id: teamId },
      access: { mode, typeId, version: status?.version ?? 0, ...(mode === 'link' ? { userId } : {}),
        phoneLogin: entry === 'phone' ? loginPhone : entry === 'existing' ? (mode === 'link' ? selectedAccount?.phoneLogin : status?.phoneLogin) : null,
        username: entry === 'username' ? username.trim() : entry === 'existing' ? (mode === 'link' ? selectedAccount?.username : status?.username) : undefined },
      operationId: crypto.randomUUID(),
    }
    locked.current = true; setBusy(true); setError(''); setAttempt(request)
    try { const result = await saveStaffMember(teamId, request); await finish(result, request.access.mode === 'create' && !result.initialPassword) }
    catch (cause) {
      if (!mounted.current) return
      setError(staffError(cause))
      if (cause instanceof ApiError && [400, 401, 403, 404, 409, 422].includes(cause.status)) setAttempt(null)
    } finally { locked.current = false; if (mounted.current) setBusy(false) }
  }
  async function check() {
    if (locked.current) return
    locked.current = true; setBusy(true); setError('')
    try {
      const access = await getStaffAccess(teamId)
      if (!mounted.current) return
      if (access.userId) await finish({ member: { ...person, id: teamId }, access }, true)
      else setError('O acesso ainda não foi confirmado. Reenvie a mesma solicitação para conferir.')
    } catch (cause) { if (mounted.current) setError(staffError(cause)) }
    finally { locked.current = false; if (mounted.current) setBusy(false) }
  }
  return <EditorPanel title="Pessoa da equipe" className="registration-clean-editor staff-member-editor" busy={busy} onClose={onClose}>
    <form className="operation-form" onSubmit={submit}>
      <Group title="Pessoa e função">
        <Field label="Nome" required disabled={frozen} value={person.name} onChange={name => setPerson(current => ({ ...current, name }))} />
        <Field label="Telefone" type="tel" disabled={frozen} value={person.phone} onChange={phone => setPerson(current => ({ ...current, phone }))} />
        <Field label="Função" disabled={frozen} value={person.role} onChange={role => setPerson(current => ({ ...current, role }))} options={[...new Set(['Professor de futevôlei', 'Bar', 'Limpeza', 'Apoio operacional', 'Outra', person.role])]} />
        <Field label="Situação" disabled={frozen || owner} value={person.status} onChange={value => setPerson(current => ({ ...current, status: value }))} options={['Ativo', 'A confirmar', 'Inativo']} />
      </Group>
      <Group title="Acesso ao sistema">
        {status?.userId ? <p className="arena-hint operation-field-wide">Conta vinculada: {status.phoneLogin || status.username || 'Entrada com Google'}. {owner ? 'Conta administrativa dos donos.' : 'O vínculo existente será preservado.'}</p> : <Field label="Conta de acesso" value={mode} disabled={frozen} onChange={value => changeMode(value as typeof mode)} options={[{ value: 'create', label: 'Criar conta individual' }, { value: 'link', label: 'Vincular conta existente' }, ...(existing ? [{ value: 'none', label: 'Manter acesso pendente' }] : [])]} />}
        {mode !== 'none' && <Field label="Tipo de acesso" required disabled={frozen || owner} value={typeId} onChange={id => { setTypeId(id); if (mode === 'link') setUserId('') }} options={[{ value: '', label: 'Selecione o tipo' }, ...context.types.map(item => ({ value: item.id, label: item.name }))]} />}
        {mode === 'link' && <Field label="Conta existente" required disabled={frozen} value={userId} onChange={chooseAccount} options={[{ value: '', label: 'Selecione a conta da pessoa' }, ...compatible.map(account => ({ value: account.id, label: accountLabel(account) }))]} />}
        {mode !== 'none' && (mode !== 'link' || selectedAccount) && <>
          <Field label="Entrada da conta" disabled={frozen || owner} value={entry} onChange={value => setEntry(value as typeof entry)} options={[...(mode !== 'create' ? [{ value: 'existing', label: 'Manter entrada atual' }] : []), { value: 'phone', label: 'Telefone' }, { value: 'username', label: 'Usuário' }]} />
          {entry === 'phone' && <Field label="Telefone de acesso" required disabled={frozen || owner} type="tel" value={loginPhone} onChange={value => { setPhoneLogin(value); setPhoneEdited(true) }} />}
          {entry === 'username' && <Field label="Usuário de acesso" required disabled={frozen || owner} value={username} onChange={setUsername} />}
          {(mode === 'link' || mode === 'keep') && <p className="arena-hint operation-field-wide">Os métodos de entrada existentes são preservados. A alteração do acesso encerra as sessões anteriores.</p>}
          {mode === 'create' && <p className="arena-hint operation-field-wide">A senha temporária será exibida uma vez e valerá por 24 horas.</p>}
        </>}
      </Group>
      {canEditCosts && <Disclosure title="Acordo de pagamento"><Group title="Acordo de pagamento">
        <Field label="Valor combinado (R$)" type="money" min={0} disabled={frozen} value={person.payAmount ?? ''} onChange={value => setPerson(current => ({ ...current, payAmount: value === '' ? null : Number(value) }))} />
        <Field label="Base do valor" disabled={frozen} value={person.payBasis} onChange={payBasis => setPerson(current => ({ ...current, payBasis }))} options={['A combinar', 'Por hora', 'Por dia', 'Por turno', 'Por aula', 'Valor mensal', 'Outro']} />
        <Field label="Frequência de pagamento" disabled={frozen} value={person.paymentFrequency} onChange={paymentFrequency => setPerson(current => ({ ...current, paymentFrequency }))} options={['A combinar', 'Diário', 'Semanal', 'Quinzenal', 'Mensal']} />
        <Field label="Dia combinado para pagar" disabled={frozen} value={person.paymentDay} onChange={paymentDay => setPerson(current => ({ ...current, paymentDay }))} />
        <label className="operation-field operation-field-wide">Observações do acordo<textarea rows={3} disabled={frozen} value={person.notes} onChange={event => setPerson(current => ({ ...current, notes: event.target.value }))} /></label>
      </Group></Disclosure>}
      {error && <p role="alert" className="arena-message arena-error">{error}</p>}
      {attempt && !busy && <div className="staff-pending"><p role="status">Confira esta solicitação antes de criar outro acesso.</p>{!status?.userId && ['create', 'link'].includes(attempt.access.mode) && <button type="button" className="secondary-link" onClick={() => void check()}>Conferir cadastro</button>}</div>}
      <SaveRow busy={busy} disabled={mode !== 'none' && !type || mode === 'link' && !userId} onCancel={onClose} label={attempt ? 'Reenviar mesma solicitação' : 'Salvar cadastro'} />
    </form>
  </EditorPanel>
}

function accountLabel(account: StaffAccount) { return `${account.name} · ${account.phoneLogin || account.username || (account.googleLinked ? 'Google' : 'Conta existente')}` }
