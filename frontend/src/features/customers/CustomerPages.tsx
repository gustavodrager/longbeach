import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Disclosure, EditorPanel, ContextLink, SectionTabs, useContextSearchParams, useUnsavedChanges } from '../../components/managementUi'
import { Breadcrumb, DetailList, Field, Group, Heading, Status, useFilters } from '../../pages/arenaUi'
import { hasPermission, isManagement } from '../auth/access'
import { useAuth } from '../auth/authContext'
import { createCustomer, customerPhone, updateCustomer, useCustomer, useCustomerCommand, useCustomers, validCustomerPhone, type Customer, type CustomerCreate, type CustomerProfile } from './api'
import { useConfirmationGate } from '../attendance/Core'
import { readCustomerCreation, rememberCustomerCreation } from './confirmation'
import { CustomerReconciliation } from './CustomerReconciliation'
import { CustomerAccessControls, CustomerLinks } from './CustomerLinks'
import './customers.css'
import '../../pages/registration-clean.css'

const profiles: CustomerProfile[] = ['Aluno', 'Mensalista', 'Avulso', 'Bar', 'SomenteBar']
const profileLabels: Record<CustomerProfile, string> = { Aluno: 'Aluno', Mensalista: 'Mensalista', Avulso: 'Avulso', Bar: 'Bar', SomenteBar: 'Somente bar' }
const originLabels: Record<string, string> = { students: 'Escola', projects: 'Mensalistas', rentalmembers: 'Mensalistas', rentalgroups: 'Mensalistas', bar: 'Bar', bartabs: 'Bar', barsales: 'Bar', reservations: 'Reservas', users: 'Área do cliente', google: 'Área do cliente', directory: 'Cadastro da equipe', manual: 'Cadastro da equipe' }
const originLabel = (value: string) => originLabels[value.toLowerCase()] ?? 'Cadastro anterior'
export function CustomersPage() {
  const { user } = useAuth()
  const filters = useFilters()
  const pageNumber = Number(filters.params.get('page') ?? 1)
  const page = Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1
  const profile = profiles.find(value => value === filters.params.get('profile')) ?? ''
  const secondaryFilterCount = [profile, filters.status, filters.params.get('incomplete')].filter(Boolean).length
  const query = useCustomers({ search: filters.query, profile, incomplete: filters.params.get('incomplete') ?? '', status: filters.status, page })
  if (!hasPermission(user, 'customers:read')) return <CustomerAccessDenied />
  return <main className="operation-page arena-page registration-clean customer-page-clean">
    <Heading eyebrow="" title="Clientes" action={hasPermission(user, 'customers:write') && <ContextLink className="primary-link" state={{ returnLabel: 'Clientes' }} to={filters.href('/clientes/novo')}>Novo cliente</ContextLink>} />
    <div className="customer-directory-tools">
      <Field label="Buscar cliente" value={filters.query} onChange={value => filters.set('q', value)} placeholder="Nome ou telefone" />
      <Disclosure title="Filtros" count={secondaryFilterCount}><div className="customer-directory-filters">
        <Field label="Atividade" value={profile} onChange={value => filters.set('profile', value)} options={[{ value: '', label: 'Todos os clientes' }, ...profiles.map(value => ({ value, label: profileLabels[value] }))]} />
        <Field label="Situação" value={filters.status} onChange={value => filters.set('status', value)} options={[{ value: '', label: 'Todas' }, 'Ativo', 'Inativo']} />
        <Field label="Telefone" value={filters.params.get('incomplete') ?? ''} onChange={value => filters.set('incomplete', value)} options={[{ value: '', label: 'Todos' }, { value: 'true', label: 'Pendente' }, { value: 'false', label: 'Informado' }]} />
      </div></Disclosure>
    </div>
    {query.isFetching && <p role="status">Consultando clientes…</p>}
    {query.isError && <p role="alert">Não foi possível consultar os clientes. <button type="button" className="text-button" onClick={() => void query.refetch()}>Tentar novamente</button></p>}
    {query.data && !query.isError && <>
      <p role="status">{query.data.total} {query.data.total === 1 ? 'cliente encontrado' : 'clientes encontrados'}</p>
      <div className="customer-directory-list">{query.data.items.map(customer => <ContextLink key={customer.id} className="customer-directory-row" to={filters.href(`/clientes/${customer.id}`)} state={{ returnLabel: 'Clientes' }}>
        <div><strong>{customer.name}</strong><small className={customer.incomplete ? 'customer-contact-pending' : undefined}>{customer.phone || 'Telefone pendente'}{customer.incomplete && customer.phone && ' · Telefone pendente'}</small><div className="customer-tags">{customer.profiles.map(item => <span className="status-pill" key={item}>{item}</span>)}</div></div>
        <Status warning={customer.incomplete}>{customer.status}</Status>
      </ContextLink>)}</div>
      {!query.data.items.length && <p>Nenhum cliente nesta seleção. Confira os filtros antes de cadastrar.</p>}
      {query.data.total > query.data.pageSize && <nav className="arena-pagination" aria-label="Páginas dos clientes"><button type="button" className="secondary-link" disabled={page <= 1 || query.isFetching} onClick={() => filters.set('page', String(page - 1))}>Anterior</button><span>{query.data.page} de {Math.max(1, Math.ceil(query.data.total / query.data.pageSize))}</span><button type="button" className="secondary-link" disabled={page * query.data.pageSize >= query.data.total || query.isFetching} onClick={() => filters.set('page', String(page + 1))}>Próxima</button></nav>}
    </>}
    <CustomerAdministration />
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
  const showForm = editing && editable && Boolean(isNew || customer) && !customer?.mergedIntoId
  return <main className="operation-page arena-page registration-clean customer-page-clean">
    <Breadcrumb to={filters.href('/clientes')} label="Clientes" />
    <Heading eyebrow="" title={isNew ? 'Novo cliente' : customer?.name ?? 'Ficha do cliente'} action={!isNew && customer && !customer.mergedIntoId && !editing && editable && <button type="button" className="secondary-link" onClick={open}>Editar cadastro</button>} />
    {!isNew && query.isFetching && <p role="status">Consultando cadastro…</p>}
    {!isNew && query.isError && <p role="alert">Não foi possível abrir esta ficha. <button className="text-button" type="button" onClick={() => void query.refetch()}>Tentar novamente</button></p>}
    {customer?.mergedIntoId && <p role="status">Este cadastro foi unificado após revisão. <Link to={filters.href(`/clientes/${customer.mergedIntoId}`)}>Abrir cadastro mantido</Link></p>}
    {showForm && <EditorPanel className="registration-clean-editor" title={isNew ? 'Novo cliente' : 'Editar cliente'} busy={busy} onClose={close}>
      <CustomerForm customer={customer} busyChanged={setBusy} refresh={async () => { const result = await query.refetch(); return result.isError ? undefined : result.data }} cancel={close} saved={saved => { if (isNew) navigate(filters.href(`/clientes/${saved.id}`)); else close() }} />
    </EditorPanel>}
    {customer && !query.isError && <>
      {customer.incomplete && !showForm && <p className="arena-message" role="status">Cadastro antigo com telefone pendente. Os vínculos existentes continuam válidos.</p>}
      <SectionTabs items={[{ value: 'cadastro', label: 'Cadastro' }, { value: 'atividades', label: 'Atividades' }]} value={section} onChange={setSection} />
      <section className="operation-card" hidden={section !== 'cadastro'}><h2>Contato</h2><DetailList items={[["Telefone", customer.phone || 'Pendente'], ["E-mail", customer.email], ["Situação", customer.status]]} /><Disclosure title="Origem do cadastro"><p>{originLabel(customer.origin)}</p></Disclosure></section>
      <section className="operation-card" hidden={section !== 'atividades'}><h2>Atividades</h2>{customer.profiles.length > 0 && <div className="customer-tags">{customer.profiles.map(profile => <span className="status-pill" key={profile}>{profile}</span>)}</div>}<CustomerLinks customer={customer} enabled={section === 'atividades'} /></section>
      <CustomerAccessControls customer={customer} refresh={() => { void query.refetch() }} />
    </>}
    {customer && <div hidden={editing || query.isError}><CustomerAdministration customer={customer} /></div>}
  </main>
}

function CustomerAdministration({ customer }: { customer?: Customer }) {
  const { user } = useAuth()
  if (!isManagement(user) || !hasPermission(user, 'customers:merge')) return null
  return <Disclosure title="Opções administrativas"><CustomerReconciliation customer={customer} /></Disclosure>
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
    if (!name.trim() || (!preserveLegacyPhone && !validCustomerPhone(phone))) { setValidation('Informe o nome e um telefone válido com DDD.'); return }
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
      <Group title="Identificação"><label className="operation-field">Nome<input maxLength={240} disabled={Boolean(pending) || invalidPending} required value={name} onChange={event => setName(event.target.value)} /></label><Field label="Telefone com DDD" type="tel" disabled={Boolean(pending) || invalidPending} required={!customer || Boolean(customer.phone)} value={phone} onChange={setPhone} />{customer && <Field label="Situação do cliente" value={status} onChange={value => setStatus(value as Customer['status'])} options={['Ativo', 'Inativo']} />}</Group>
      <Disclosure title="Mais dados" open={Boolean(email)}><Field label="E-mail de contato (opcional)" type="email" disabled={Boolean(pending) || invalidPending} value={email} onChange={setEmail} /></Disclosure>
      {pending && <p role="status">Há uma criação pendente de confirmação. Os dados e a mesma operação serão recuperados antes de iniciar outro cadastro.</p>}{invalidPending && <p role="alert">A confirmação anterior não pôde ser lida. Peça à gestão para conferir antes de criar outra pessoa.</p>}
      {customer?.incomplete && <p className="arena-hint" role="status">Cadastro antigo com telefone pendente. Você pode manter o contato atual; os vínculos existentes continuam válidos.</p>}
      {validation && <p role="alert">{validation}</p>}{command.error && <p role="alert">{command.error}</p>}
      {command.conflict && customer && <section className="customer-merge-review"><h3>O cadastro mudou em outro atendimento</h3><p>Seus campos foram preservados. Confira a versão atual antes de continuar.</p><button className="secondary-link" type="button" onClick={async () => { const value = await refresh(); if (value) setLatest(value) }}>Comparar cadastro atual</button>{latest && <><DetailList items={[["Nome atual", latest.name], ["Telefone atual", latest.phone], ["E-mail atual", latest.email], ["Situação atual", latest.status]]} /><button className="secondary-link" type="button" onClick={() => { setName(latest.name); setPhone(latest.phone); setEmail(latest.email ?? ''); setStatus(latest.status); setVersion(latest.version); setLatest(undefined); cancel() }}>Fechar edição e usar cadastro atualizado</button></>}</section>}
      <div className="form-actions"><button className="primary-button" disabled={command.busy || invalidPending || command.conflict && Boolean(customer)} type="submit">{command.busy ? 'Salvando…' : pending ? 'Conferir criação pendente' : 'Salvar cliente'}</button><button className="secondary-link" disabled={command.busy || Boolean(pending) || invalidPending} type="button" onClick={cancel}>Cancelar</button></div>
    </fieldset>
  </form>
}
export function CustomerAccessDenied() { return <main className="operation-page registration-clean"><Heading eyebrow="" title="Acesso restrito" description="Sua conta não possui permissão para consultar este cadastro." /><Link to="/">Voltar ao início</Link></main> }
