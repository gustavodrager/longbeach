import { useEffect, useState } from 'react'
import { ContextLink } from '../../components/managementUi'
import { hasPermission } from '../auth/access'
import { useAuth } from '../auth/authContext'
import { assignCustomerUser, canManageCustomerUsers, useCustomerCommand, useCustomerLinks, useCustomerUsers, type Customer, type CustomerLink, type CustomerUserChoice } from './api'

const sourcePermissions: Record<string, string> = { students: 'students:read', rentalMembers: 'projects:read', rentalGroups: 'projects:read', reservations: 'projects:read', tabs: 'bar:sales:read', barTabs: 'bar:sales:read', sales: 'bar:sales:read', barSales: 'bar:sales:read' }
function sourcePath(link: CustomerLink) {
  if (link.kind === 'students') return `/alunos/${link.sourceId}`
  if (link.kind === 'rentalMembers' && link.parentId) return `/mensalistas/${link.parentId}?secao=integrantes`
  if (link.kind === 'rentalGroups') return `/mensalistas/${link.sourceId}`
  if (link.kind === 'reservations') return `/agenda/${link.sourceId}`
  if (link.kind === 'tabs' || link.kind === 'barTabs') return `/atendimento/comandas/${link.sourceId}`
  if (link.kind === 'sales' || link.kind === 'barSales') return '/bar/vendas'
  return null
}
const sourceLabels: Record<string, string> = { students: 'Aluno', rentalMembers: 'Grupo mensalista', rentalGroups: 'Grupo mensalista', reservations: 'Reserva', tabs: 'Comanda', barTabs: 'Comanda', sales: 'Venda anterior', barSales: 'Venda anterior' }
export function CustomerLinks({ customer, refresh }: { customer: Customer; refresh?: () => void }) {
  const { user } = useAuth()
  const canSeeSources = Object.values(sourcePermissions).some(permission => hasPermission(user, permission))
  const query = useCustomerLinks(customer.id, canSeeSources)
  const links = query.data?.filter(link => sourcePermissions[link.kind] && hasPermission(user, sourcePermissions[link.kind])) ?? []
  return <>
    {canSeeSources && <section><h3>Registros relacionados</h3>{query.isFetching && <p role="status">Consultando vínculos…</p>}{query.isError ? <p role="alert">Não foi possível consultar os vínculos. <button className="text-button" type="button" onClick={() => void query.refetch()}>Tentar novamente</button></p> : query.data && <>{links.map(link => { const path = sourcePath(link); return path ? <p key={`${link.kind}:${link.parentId}:${link.sourceId}`}><ContextLink to={path} state={{ returnLabel: customer.name }}>{sourceLabels[link.kind]} · {link.name} →</ContextLink></p> : null })}{!links.length && <p>Nenhum registro relacionado disponível para suas permissões.</p>}</>}</section>}
    {canManageCustomerUsers(user) && <CustomerUserAssociation key={`${customer.id}:${customer.version}`} customer={customer} refresh={refresh} />}
  </>
}
function CustomerUserAssociation({ customer, refresh }: { customer: Customer; refresh?: () => void }) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<CustomerUserChoice | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [unlink, setUnlink] = useState(false)
  const query = useCustomerUsers(customer.id, search, !selected)
  const command = useCustomerCommand()
  useEffect(() => { setConfirmed(false) }, [customer.version])
  return <section><h3>Conta Google de acesso</h3><p>Confira a identidade antes de associar. Este vínculo não cria login, não altera cobranças e não concede automaticamente acesso a compromissos ou comandas.</p>
    <fieldset disabled={command.busy}>
      <label className="operation-field">Buscar conta Google<input type="search" maxLength={240} placeholder="Nome ou e-mail" value={search} onChange={event => { setSearch(event.target.value); setSelected(null); setConfirmed(false) }} /></label>
      {search.trim().length >= 2 && <>{query.isFetching && <p role="status">Buscando contas…</p>}{query.isError ? <p role="alert">Não foi possível pesquisar contas. <button type="button" onClick={() => void query.refetch()}>Tentar novamente</button></p> : query.data && <>{query.data.map(person => <button className="customer-option" key={person.id} type="button" onClick={() => { setSelected(person); setUnlink(false); setConfirmed(false) }}>{person.name} · {person.emailHint}</button>)}{!query.data.length && !selected && <p>Nenhuma conta disponível nesta busca.</p>}</>}</>}
      {selected && <p>Conta escolhida: <strong>{selected.name}</strong> · {selected.emailHint}</p>}
      {customer.userId && <label className="rental-checkbox"><input type="checkbox" checked={unlink} onChange={event => { setUnlink(event.target.checked); setSelected(null); setConfirmed(false) }} />Remover a associação atual, preservando o cadastro e os registros anteriores</label>}
      {(selected || unlink) && <><label className="rental-checkbox"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Conferi a identidade e a associação que será alterada.</label><button className="secondary-link" type="button" disabled={!confirmed || command.busy || command.conflict} onClick={async () => { const value = await command.run(() => assignCustomerUser(customer.id, unlink ? null : selected!.id, customer.version)); if (value) { setSelected(null); setSearch(''); setConfirmed(false); setUnlink(false) } }}>{unlink ? 'Confirmar remoção da associação' : 'Confirmar associação da conta'}</button></>}
    </fieldset>{command.error && <p role="alert">{command.error}{command.conflict && <> Atualize a ficha e confira novamente.{refresh && <button type="button" className="text-button" onClick={refresh}>Atualizar ficha para nova conferência</button>}</>}</p>}
  </section>
}
