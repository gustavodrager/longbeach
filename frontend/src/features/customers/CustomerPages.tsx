import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EditorPanel, ContextLink, SectionTabs, useContextSearchParams, useUnsavedChanges } from '../../components/managementUi'
import { Breadcrumb, DetailList, Field, Group, Heading, Status, useFilters } from '../../pages/arenaUi'
import { hasPermission } from '../auth/access'
import { useAuth } from '../auth/authContext'
import { createCustomer, customerPhone, updateCustomer, useCustomer, useCustomerCommand, useCustomers, validCustomerPhone, type Customer, type CustomerCreate, type CustomerProfile } from './api'
import { useConfirmationGate } from '../attendance/Core'
import { readCustomerCreation, rememberCustomerCreation } from './confirmation'
import { CustomerReconciliation } from './CustomerReconciliation'
import { CustomerLinks } from './CustomerLinks'
import './customers.css'

const profiles: CustomerProfile[] = ['Aluno', 'Mensalista', 'Bar']
const originLabels: Record<string, string> = { students: 'Escola', projects: 'Mensalistas', rentalmembers: 'Mensalistas', rentalgroups: 'Mensalistas', bar: 'Bar', bartabs: 'Bar', barsales: 'Bar', reservations: 'Reservas', users: 'Área do cliente', google: 'Área do cliente', directory: 'Cadastro da equipe', manual: 'Cadastro da equipe' }
const originLabel = (value: string) => originLabels[value.toLowerCase()] ?? 'Cadastro anterior'
export function CustomersPage() {
  const { user } = useAuth()
  const filters = useFilters()
  const pageNumber = Number(filters.params.get('page') ?? 1)
  const page = Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1
  const profile = profiles.find(value => value === filters.params.get('profile')) ?? ''
  const query = useCustomers({ search: filters.query, profile, incomplete: filters.params.get('incomplete') ?? '', status: filters.status, page })
  if (!hasPermission(user, 'customers:read')) return <CustomerAccessDenied />
  return <main className="operation-page arena-page">
    <Heading title="Clientes" description="Um cadastro para aulas, mensalistas, reservas e Bar. Os vínculos e o acesso à área pessoal continuam separados." action={hasPermission(user, 'customers:write') && <ContextLink className="primary-link" state={{ returnLabel: 'Clientes' }} to={filters.href('/clientes/novo')}>+ Cadastrar cliente</ContextLink>} />
    <div className="customer-directory-filters">
      <Field label="Buscar cliente" value={filters.query} onChange={value => filters.set('q', value)} placeholder="Nome ou telefone" />
      <Field label="Vínculo" value={profile} onChange={value => filters.set('profile', value)} options={[{ value: '', label: 'Todos os clientes' }, ...profiles]} />
      <Field label="Situação" value={filters.status} onChange={value => filters.set('status', value)} options={[{ value: '', label: 'Todas' }, 'Ativo', 'Inativo']} />
      <Field label="Preenchimento" value={filters.params.get('incomplete') ?? ''} onChange={value => filters.set('incomplete', value)} options={[{ value: '', label: 'Todos' }, { value: 'true', label: 'Com telefone pendente' }, { value: 'false', label: 'Completos' }]} />
    </div>
    {query.isFetching && <p role="status">Consultando clientes…</p>}
    {query.isError && <p role="alert">Não foi possível consultar os clientes. <button type="button" className="text-button" onClick={() => void query.refetch()}>Tentar novamente</button></p>}
    {query.data && !query.isError && <>
      <p role="status">{query.data.total} {query.data.total === 1 ? 'cliente encontrado' : 'clientes encontrados'}</p>
      <div className="customer-directory-list">{query.data.items.map(customer => <ContextLink key={customer.id} className="customer-directory-row" to={filters.href(`/clientes/${customer.id}`)} state={{ returnLabel: 'Clientes' }}>
        <div><strong>{customer.name}</strong><small>{customer.phone || 'Telefone pendente'}</small><div className="customer-tags">{customer.profiles.map(item => <span className="status-pill" key={item}>{item}</span>)}</div></div>
        <Status warning={customer.incomplete}>{customer.incomplete ? 'Cadastro incompleto' : customer.status}</Status><span>Ver ficha →</span>
      </ContextLink>)}</div>
      {!query.data.items.length && <p>Nenhum cliente corresponde à seleção. Confira os filtros antes de cadastrar outra pessoa.</p>}
      {query.data.total > query.data.pageSize && <nav className="arena-pagination" aria-label="Páginas dos clientes"><button type="button" className="secondary-link" disabled={page <= 1 || query.isFetching} onClick={() => filters.set('page', String(page - 1))}>Anterior</button><span>{query.data.page} de {Math.max(1, Math.ceil(query.data.total / query.data.pageSize))}</span><button type="button" className="secondary-link" disabled={page * query.data.pageSize >= query.data.total || query.isFetching} onClick={() => filters.set('page', String(page + 1))}>Próxima</button></nav>}
    </>}
    <CustomerReconciliation />
  </main>
}

export function CustomerDetailsPage() {
  const { customerId = 'novo' } = useParams()
  const { user } = useAuth()
  const session = user ? `${user.id}:${[...user.roles].sort().join(',')}:${[...user.permissions].sort().join(',')}` : 'signed-out'
  // A route change owns a new form lifetime; a late response for A cannot edit B.
  return <CustomerDetails key={`${session}:${customerId}`} id={customerId} />
}
function CustomerDetails({ id }: { id: string }) {
  const { user } = useAuth()
  const filters = useFilters()
  const navigate = useNavigate()
  const [params, setParams] = useContextSearchParams()
  const isNew = id === 'novo'
  const query = useCustomer(id)
  const [busy, setBusy] = useState(false)
  const editable = hasPermission(user, 'customers:write')
  const editing = isNew || params.get('acao') === 'editar'
  const close = () => { if (isNew) navigate(filters.href('/clientes')); else setParams(current => { const next = new URLSearchParams(current); next.delete('acao'); next.delete('registro'); return next }, { replace: true, preventScrollReset: true }) }
  const open = () => setParams(current => { const next = new URLSearchParams(current); next.set('acao', 'editar'); return next }, { preventScrollReset: true })
  const [section, setSection] = useState('cadastro')
  if (!hasPermission(user, 'customers:read') || isNew && !editable) return <CustomerAccessDenied />
  const customer = query.data
  return <main className="operation-page arena-page">
    <Breadcrumb to={filters.href('/clientes')} label="Clientes" />
    <Heading title={isNew ? 'Cadastrar cliente' : customer?.name ?? 'Ficha do cliente'} description="Identificação compartilhada. Matrículas, grupos, comandas, pagamentos e login têm seus próprios vínculos." action={!isNew && customer && !customer.mergedIntoId && !editing && editable && <button type="button" className="secondary-link" onClick={open}>Editar cadastro</button>} />
    {!isNew && query.isFetching && <p role="status">Consultando cadastro…</p>}
    {!isNew && query.isError && <p role="alert">Não foi possível abrir esta ficha. <button className="text-button" type="button" onClick={() => void query.refetch()}>Tentar novamente</button></p>}
    {customer?.mergedIntoId && <p role="status">Este cadastro foi unificado após revisão. <Link to={filters.href(`/clientes/${customer.mergedIntoId}`)}>Abrir cadastro mantido</Link></p>}
    {editing && editable && (isNew || customer) && !customer?.mergedIntoId && <EditorPanel title={isNew ? 'Cadastrar cliente' : 'Editar cliente'} busy={busy} onClose={close}>
      <CustomerForm customer={customer} busyChanged={setBusy} refresh={async () => { const result = await query.refetch(); return result.isError ? undefined : result.data }} cancel={close} saved={saved => { if (isNew) navigate(filters.href(`/clientes/${saved.id}`)); else close() }} />
    </EditorPanel>}
    {customer && !query.isError && <>
      {customer.incomplete && <p className="arena-message" role="status">Cadastro antigo com telefone pendente. Os vínculos existentes continuam válidos; a equipe ou o próprio cliente pode completar o contato.</p>}
      <SectionTabs items={[{ value: 'cadastro', label: 'Cadastro' }, { value: 'vinculos', label: 'Vínculos e acesso' }]} value={section} onChange={setSection} />
      {section === 'cadastro' ? <section className="operation-card"><h2>Dados do cliente</h2><DetailList items={[["Nome", customer.name], ["Telefone", customer.phone || 'Pendente de preenchimento'], ["E-mail de contato", customer.email], ["Situação", customer.status], ["Origem do cadastro", originLabel(customer.origin)]]} /><p className="arena-hint">A origem indica onde o cadastro começou e não cria vínculos de aluno, mensalista ou Bar. O e-mail de contato não altera o e-mail de entrada com Google.</p></section> : <section className="operation-card"><h2>Vínculos e acesso</h2><p>{customer.profiles.length ? customer.profiles.join(' · ') : 'Nenhum vínculo de aluno, mensalista ou Bar informado.'}</p><p>{customer.userId ? 'Conta de acesso vinculada.' : 'Sem conta de acesso vinculada.'} Selecionar este cadastro em um atendimento não concede acesso à agenda ou aos pagamentos.</p><p className="arena-hint">O responsável financeiro pode ser outra pessoa. Unificar identificação não muda contas, valores ou permissões de acesso.</p><CustomerLinks customer={customer} refresh={() => { void query.refetch() }} /></section>}
    </>}
    {customer && !editing && !query.isError && <CustomerReconciliation customer={customer} />}
  </main>
}

type CustomerFormProps = { customer?: Customer; busyChanged: (value: boolean) => void; cancel: () => void; saved: (customer: Customer) => void; refresh: () => Promise<Customer | undefined> }
function CustomerForm({ customer, busyChanged, cancel, saved, refresh }: CustomerFormProps) {
  const { user } = useAuth()
  const [confirmation, setConfirmation] = useConfirmationGate(`customer-create-v1:${user?.id}:directory:${customer?.id ?? 'novo'}`)
  const pending = customer ? null : readCustomerCreation(confirmation)
  const invalidPending = Boolean(!customer && confirmation && !pending)
  const [name, setName] = useState(customer?.name ?? pending?.name ?? '')
  const [phone, setPhone] = useState(customer?.phone ?? pending?.phone ?? '')
  const [email, setEmail] = useState(customer?.email ?? pending?.email ?? '')
  const [status, setStatus] = useState<Customer['status']>(customer?.status ?? 'Ativo')
  const [version, setVersion] = useState(customer?.version ?? 0)
  const [validation, setValidation] = useState('')
  const [latest, setLatest] = useState<Customer>()
  const command = useCustomerCommand()
  useEffect(() => { busyChanged(command.busy || Boolean(pending) || invalidPending) }, [command.busy, Boolean(pending), invalidPending, busyChanged])
  const { markSaved } = useUnsavedChanges()
  const attempt = useRef<{ fingerprint: string; input: CustomerCreate } | null>(null)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (invalidPending) return
    const preserveLegacyPhone = Boolean(customer?.incomplete && phone === customer.phone)
    if (!name.trim() || (!preserveLegacyPhone && !validCustomerPhone(phone))) { setValidation('Informe o nome e um telefone válido com DDD. O contato de um cadastro antigo pode continuar pendente sem ser alterado.'); return }
    setValidation('')
    const fields = { name: name.trim(), phone: preserveLegacyPhone ? phone : customerPhone(phone), email: email.trim() || null }
    const fingerprint = JSON.stringify(fields)
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, input: { ...fields, operationId: crypto.randomUUID() } }
    const result = await command.run(() => {
      if (customer) return updateCustomer(customer.id, { ...fields, status, expectedVersion: version })
      const input = pending ?? attempt.current!.input
      rememberCustomerCreation(setConfirmation, input)
      return createCustomer(input)
    })
    if (result) {
      if (!customer) { try { setConfirmation('') } catch { setValidation('Cadastro confirmado; confira a mesma criação para recuperar o cadastro antes de continuar.'); return } }
      markSaved(); saved(result)
    } else if (!customer && [400, 422].includes(command.failureStatus())) { try { setConfirmation('') } catch { /* Preserve recovery checkpoint. */ } }
  }
  return <form className="customer-editor operation-form" onSubmit={event => void submit(event)}>
    <fieldset disabled={command.busy}>
      <Group title="Identificação"><label className="operation-field">Nome<input maxLength={240} disabled={Boolean(pending) || invalidPending} required value={name} onChange={event => setName(event.target.value)} /></label><Field label="Telefone com DDD" type="tel" disabled={Boolean(pending) || invalidPending} required={!customer || Boolean(customer.phone)} value={phone} onChange={setPhone} /><Field label="E-mail de contato (opcional)" type="email" disabled={Boolean(pending) || invalidPending} value={email} onChange={setEmail} />{customer && <Field label="Situação do cliente" value={status} onChange={value => setStatus(value as Customer['status'])} options={['Ativo', 'Inativo']} />}</Group>
      {pending && <p role="status">Há uma criação pendente de confirmação. Os dados e a mesma operação serão recuperados antes de iniciar outro cadastro.</p>}{invalidPending && <p role="alert">A confirmação anterior não pôde ser lida. Peça à gestão para conferir antes de criar outra pessoa.</p>}
      <p className="arena-hint">Nome e telefone são obrigatórios em novos cadastros. O cadastro não cria login, matrícula, reserva ou cobrança.</p>
      {validation && <p role="alert">{validation}</p>}{command.error && <p role="alert">{command.error}</p>}
      {command.conflict && customer && <section className="customer-merge-review"><h3>O cadastro mudou em outro atendimento</h3><p>Seus campos foram preservados. Confira a versão atual antes de continuar.</p><button className="secondary-link" type="button" onClick={async () => { const value = await refresh(); if (value) setLatest(value) }}>Comparar cadastro atual</button>{latest && <><DetailList items={[["Nome atual", latest.name], ["Telefone atual", latest.phone], ["E-mail atual", latest.email], ["Situação atual", latest.status]]} /><button className="secondary-link" type="button" onClick={() => { setName(latest.name); setPhone(latest.phone); setEmail(latest.email ?? ''); setStatus(latest.status); setVersion(latest.version); setLatest(undefined); cancel() }}>Fechar edição e usar cadastro atualizado</button></>}</section>}
      <div className="form-actions"><button className="primary-button" disabled={command.busy || invalidPending || command.conflict && Boolean(customer)} type="submit">{command.busy ? 'Salvando…' : pending ? 'Conferir criação pendente' : 'Salvar cliente'}</button><button className="secondary-link" disabled={command.busy || Boolean(pending) || invalidPending} type="button" onClick={cancel}>Cancelar</button></div>
    </fieldset>
  </form>
}
export function CustomerAccessDenied() { return <main className="operation-page"><Heading title="Acesso restrito" description="Sua conta não possui permissão para consultar este cadastro." /><Link to="/">Voltar ao início</Link></main> }
