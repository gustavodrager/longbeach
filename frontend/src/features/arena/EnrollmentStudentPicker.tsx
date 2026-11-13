import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ApiError } from '../../lib/http'
import { Field } from '../../pages/arenaUi'
import { hasPermission } from '../auth/access'
import { useAuth } from '../auth/authContext'
import { CustomerPicker } from '../customers/CustomerPicker'
import type { CustomerSelection } from '../customers/api'
import { useOperations, type Student } from '../operations/DemoDataProvider'
import { blankStudent } from '../operations/studentDraft'

type Attempt = { id: string; input: Omit<Student, 'id'> }
type Props = { simplified?: boolean; contextKey: string; onSelect: (id: string) => void; onCancel: () => void; onBusyChange: (busy: boolean) => void }

/** Adds the student profile while the surrounding enrollment stays a draft. */
export function EnrollmentStudentPicker(props: Props) {
  const { user } = useAuth()
  const session = user ? `${user.id}:${[...user.roles].sort().join(',')}:${[...user.permissions].sort().join(',')}` : 'demo'
  return <EnrollmentStudentPickerContent key={session} {...props} />
}
function EnrollmentStudentPickerContent({ contextKey, onSelect, onCancel, onBusyChange, simplified = false }: Props) {
  const data = useOperations(); const { user } = useAuth()
  const [customer, setCustomer] = useState<CustomerSelection | null>(null)
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [status, setStatus] = useState(simplified ? 'Ativo' : 'A confirmar')
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const locked = useRef(false)
  const mounted = useRef(true)
  const section = useRef<HTMLElement>(null)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; onBusyChange(false) } }, [onBusyChange])
  useLayoutEffect(() => {
    const field = section.current?.querySelector<HTMLInputElement>('input:not([type="hidden"]):not(:disabled)')
    if (field) field.focus()
    else section.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [])
  const matches = customer ? data.students.filter(student => student.customerId === customer.id) : []
  const existing = matches.length === 1 ? matches[0] : undefined
  const allowed = data.canRead('students') && data.canWrite('students')
  async function save() {
    if (!allowed || locked.current || matches.length > 1) return
    if (existing) { onSelect(existing.id); return }
    if (!attempt && (data.customerRegistryEnabled ? !customer : !name.trim())) { setError(data.customerRegistryEnabled ? 'Selecione o cliente do aluno.' : 'Informe o nome do aluno.'); return }
    const request = attempt ?? { id: crypto.randomUUID(), input: { ...blankStudent(), name: customer?.name ?? name.trim(), phone: data.customerRegistryEnabled ? '' : phone, ...(customer ? { customerId: customer.id } : {}), status } }
    locked.current = true; setBusy(true); onBusyChange(true); setAttempt(request); setError('')
    try { const id = await data.saveStudent(request.input, request.id); if (mounted.current) onSelect(id) }
    catch (cause) {
      if (!mounted.current) return
      setError(cause instanceof Error ? cause.message : 'Não foi possível confirmar o aluno. Tente conferir o mesmo cadastro.')
      if (cause instanceof ApiError && [400, 401, 403, 404, 422].includes(cause.status)) setAttempt(null)
      if (cause instanceof ApiError && cause.status === 409) {
        try { await data.reload() } catch { setError('Não foi possível atualizar os alunos. Confira o mesmo cadastro quando a conexão voltar.') }
      }
    } finally { locked.current = false; if (mounted.current) { setBusy(false); onBusyChange(false) } }
  }
  if (!allowed) return null
  return <section ref={section} className="operation-field-wide" role="group" aria-label="Cadastrar aluno na matrícula">
    <h3>Adicionar aluno</h3>
    <p className="arena-hint">Selecione um cliente existente ou cadastre um novo. Depois confirme a inclusão na turma.</p>
    {data.customerRegistryEnabled ? <CustomerPicker scope="students" contextKey={contextKey} label="Cliente do novo aluno" required disabled={busy || Boolean(attempt)} existingOnly={!hasPermission(user, 'customers:write')} value={customer} onChange={person => { setCustomer(person); setError('') }} /> : <>
      <Field label="Nome do novo aluno" required disabled={busy || Boolean(attempt)} value={name} onChange={setName} />
      <Field label="Telefone do novo aluno" type="tel" disabled={busy || Boolean(attempt)} value={phone} onChange={setPhone} />
    </>}
    {!simplified && !existing && <Field label="Situação do novo aluno" disabled={busy || Boolean(attempt)} value={status} onChange={setStatus} options={['A confirmar', 'Ativo', 'Pausado', 'Inativo']} />}
    {existing && <p>Este cliente já tem uma ficha de aluno. Você pode selecioná-la nesta matrícula.</p>}
    {matches.length > 1 && <p role="alert">Este cliente tem mais de uma ficha de aluno. Volte à matrícula e escolha a ficha existente.</p>}
    {attempt && !busy && matches.length === 0 && <p role="status">Confira a mesma criação antes de alterar os dados ou cadastrar outro aluno.</p>}
    {error && <p className="arena-message arena-error" role="alert">{error}</p>}
    <div className="form-actions">
      <button type="button" className="primary-button" disabled={busy || matches.length > 1} onClick={() => void save()}>{busy ? 'Salvando aluno…' : existing ? 'Selecionar aluno cadastrado' : attempt ? 'Conferir cadastro do aluno' : 'Cadastrar aluno e selecionar'}</button>
      <button type="button" className="secondary-link" disabled={busy || Boolean(attempt) && matches.length === 0} onClick={onCancel}>{simplified ? 'Cancelar inclusão' : 'Voltar à matrícula'}</button>
    </div>
  </section>
}
