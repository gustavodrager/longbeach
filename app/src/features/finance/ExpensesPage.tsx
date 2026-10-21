import { useDeferredValue, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../lib/http'
import { useAuth } from '../auth/authContext'
import { hasPermission } from '../auth/access'
import { useContextSearchParams } from '../../components/managementUi'
import { displayDate, Heading, NoAccess } from '../../pages/arenaUi'
import { ExpenseForm, type ExpensePurchasePrefill } from './ExpenseForm'
import { ExpenseDetailPanel } from './ExpenseDetail'
import { expenseApi, expenseMoney, expenseSubtitle, expenseTitle, type ExpenseDetail, type ExpenseFilter, type ExpenseState } from './expenses'
import './expenses.css'

export function ExpensesPage() {
  const { user } = useAuth(); const allowed = hasPermission(user, 'finance:read'); const writable = hasPermission(user, 'finance:write')
  const actor = `${user?.id}:${[...(user?.roles ?? []), ...(user?.permissions ?? [])].sort().join(',')}`
  const [params, setParams] = useContextSearchParams(); const client = useQueryClient(); const [notice, setNotice] = useState('')
  const purchaseId = params.get('purchase')
  const newOpen = params.get('acao') === 'novo' || Boolean(purchaseId && params.get('acao') !== 'ver')
  const state: ExpenseState = params.get('situacao') === 'concluidos' ? 'Completed' : 'Open'
  const rawFilter = params.get('tipo') ?? 'All'; const filter: ExpenseFilter = ['All', 'Expenses', 'Team', 'Partners'].includes(rawFilter) ? rawFilter as ExpenseFilter : 'All'
  const search = params.get('q') ?? ''; const deferredSearch = useDeferredValue(search)
  const rawPage = Number(params.get('page') ?? '1'); const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1
  const request = new URLSearchParams({ state, filter, search: deferredSearch, page: String(page), pageSize: '20' })
  const query = useQuery({ queryKey: ['expenses', 'list', actor, request.toString()], queryFn: ({ signal }) => expenseApi.list(request, signal), enabled: allowed, retry: false, refetchInterval: 60_000 })
  const options = useQuery({ queryKey: ['expenses', 'options', actor], queryFn: ({ signal }) => expenseApi.options(signal), enabled: allowed && writable && newOpen, retry: false })
  const purchase = useQuery({ queryKey: ['expenses', 'purchase', actor, purchaseId], queryFn: ({ signal }) => apiFetch<ExpensePurchasePrefill>(`/api/v1/expenses/purchase-options/${encodeURIComponent(purchaseId ?? '')}`, { signal }), enabled: allowed && writable && newOpen && Boolean(purchaseId), retry: false })
  const report = !query.isError ? query.data : undefined
  const linkedExpenseId = purchaseId && !purchase.isError ? purchase.data?.expenseId : null
  const detailId = params.get('acao') === 'ver' ? params.get('registro') : linkedExpenseId

  function change(key: string, value: string) {
    const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: key === 'q', preventScrollReset: true })
  }
  function close() { const next = new URLSearchParams(params); next.delete('acao'); next.delete('registro'); next.delete('purchase'); setParams(next, { replace: true, preventScrollReset: true }) }
  function open(id?: string) { const next = new URLSearchParams(params); next.delete('purchase'); next.set('acao', id ? 'ver' : 'novo'); if (id) next.set('registro', id); else next.delete('registro'); setNotice(''); setParams(next, { preventScrollReset: true }) }
  function saved(detail: ExpenseDetail, payment = false) {
    client.setQueryData(['expenses', 'detail', actor, detail.expense.id], detail)
    void client.invalidateQueries({ queryKey: ['expenses'] }); void client.invalidateQueries({ queryKey: ['current-financial-position'] })
    setNotice(detail.expense.status === 'Canceled' ? 'Lançamento cancelado.' : payment ? `${detail.expense.paidBy === 'Partner' ? 'Reembolso' : 'Pagamento'} registrado.` : 'Lançamento registrado.')
    if (payment) close()
    else {
      const next = new URLSearchParams(params); next.delete('purchase'); next.set('acao', 'ver'); next.set('registro', detail.expense.id)
      setParams(next, { replace: true, preventScrollReset: true })
    }
  }
  if (!allowed) return <NoAccess />
  return <main className="operation-page arena-page expenses-page">
    <Heading eyebrow="Financeiro" title="Despesas e pagamentos" description="Despesas, equipe e acertos com os sócios." action={writable && <button className="primary-button" type="button" onClick={() => open()}>+ Novo lançamento</button>} />
    {notice && <p className="arena-message" role="status">{notice}</p>}
    {query.isPending && <p role="status">Carregando despesas e pagamentos…</p>}
    {query.isError && <p className="expenses-error" role="alert">Não foi possível atualizar as despesas e pagamentos. <button type="button" className="expenses-retry" onClick={() => void query.refetch()}>Tentar novamente</button></p>}
    {report && <section className="expenses-summary" aria-label="Resumo de todas as pendências"><article><span>Total em aberto</span><strong>{expenseMoney(report.summary.outstandingAmount)}</strong><small>{report.summary.outstandingCount} {report.summary.outstandingCount === 1 ? 'pendência' : 'pendências'} · todas as datas</small></article><article><span>Desse total, aos sócios</span><strong>{expenseMoney(report.summary.partnerAmount)}</strong><small>Incluído no total em aberto</small></article></section>}
    <div className="expenses-toolbar"><div className="expenses-states" role="group" aria-label="Situação dos lançamentos"><button type="button" aria-pressed={state === 'Open'} onClick={() => change('situacao', '')}>Pendentes</button><button type="button" aria-pressed={state === 'Completed'} onClick={() => change('situacao', 'concluidos')}>Concluídos</button></div><input type="search" aria-label="Buscar pessoa ou despesa" className="expenses-search" value={search} placeholder="Buscar pessoa ou despesa" onChange={event => change('q', event.target.value)} /><select aria-label="Filtrar tipo de lançamento" className="expenses-filter" value={filter} onChange={event => change('tipo', event.target.value)}><option value="All">Todos os tipos</option><option value="Expenses">Despesas e compras</option><option value="Team">Equipe</option><option value="Partners">Sócios</option></select></div>
    {report && <><div className="expenses-table"><table aria-label="Despesas, pagamentos da equipe e reembolsos"><thead><tr><th scope="col">Lançamento</th><th scope="col">Prazo</th><th scope="col">{state === 'Open' ? 'Falta pagar' : 'Valor pago'}</th><th scope="col">Ação</th></tr></thead><tbody>{report.items.map(row => {
      const overdue = row.remainingAmount > 0 && Boolean(row.dueDate && row.dueDate < report.today)
      const concluded = row.status === 'Paid' || row.status === 'Canceled'
      return <tr key={row.id}><td><button type="button" className="expenses-record" onClick={() => open(row.id)}><strong>{expenseTitle(row)}</strong><small>{expenseSubtitle(row)}</small></button></td><td className={`expenses-deadline${overdue ? ' expenses-overdue' : ''}`}><strong>{row.status === 'Canceled' ? 'Cancelado' : concluded ? 'Concluído' : overdue ? 'Vencido' : row.dueDate ? displayDate(row.dueDate) : 'Sem prazo'}</strong>{concluded ? '' : overdue ? displayDate(row.dueDate!) : row.dueDate === report.today ? 'Hoje' : row.dueDate ? 'Vencimento' : row.paidBy === 'Partner' ? 'A reembolsar' : ''}</td><td className="expenses-amount">{expenseMoney(state === 'Open' ? row.remainingAmount : row.paidAmount)}{row.status === 'Partial' && <small>Parcial</small>}</td><td className="expenses-row-action-cell"><button className="expenses-row-action" type="button" aria-label={`${!concluded && writable ? row.paidBy === 'Partner' ? 'Reembolsar' : 'Pagar' : 'Ver histórico de'} ${expenseTitle(row)}`} onClick={() => open(row.id)}>{!concluded && writable ? row.paidBy === 'Partner' ? 'Reembolsar' : 'Pagar' : 'Ver histórico'}</button></td></tr>
    })}</tbody></table>{!report.items.length && <p className="expenses-empty">{search || filter !== 'All' ? 'Nenhum lançamento nesta seleção.' : state === 'Open' ? 'Nenhuma pendência registrada.' : 'Nenhum lançamento concluído.'}</p>}</div><div className="expenses-footer"><span>{report.total} {report.total === 1 ? 'lançamento' : 'lançamentos'} nesta lista</span><span>{state === 'Open' ? 'Vencidos primeiro · ' : ''}Abra um lançamento para ver o histórico</span></div>{report.total > report.pageSize && <nav className="expenses-pagination" aria-label="Páginas dos lançamentos"><button type="button" disabled={report.page <= 1} onClick={() => change('page', String(report.page - 1))}>Anterior</button><span>Página {report.page} de {Math.ceil(report.total / report.pageSize)}</span><button type="button" disabled={report.page * report.pageSize >= report.total} onClick={() => change('page', String(report.page + 1))}>Próxima</button></nav>}</>}
    {newOpen && writable && !linkedExpenseId && (options.isPending || Boolean(purchaseId && purchase.isPending)) && <p role="status">Carregando dados do lançamento…</p>}
    {newOpen && writable && (options.isError || Boolean(purchaseId && purchase.isError)) && <p className="expenses-error" role="alert">Não foi possível carregar os dados do lançamento. <button type="button" className="expenses-retry" onClick={() => { void options.refetch(); if (purchaseId) void purchase.refetch() }}>Tentar novamente</button><button type="button" className="expenses-retry" onClick={close}>Voltar à lista</button></p>}
    {newOpen && writable && !linkedExpenseId && options.data && !options.isError && (!purchaseId || purchase.isSuccess) && <ExpenseForm key={purchaseId ?? 'avulso'} options={options.data} purchase={purchaseId ? purchase.data : undefined} onClose={close} onSaved={detail => saved(detail)} />}
    {detailId && <ExpenseDetailPanel id={detailId} actor={actor} canWrite={writable} onClose={close} onPaid={detail => saved(detail, true)} />}
  </main>
}
