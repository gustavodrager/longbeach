import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ExpensesPage } from './ExpensesPage'
import { ExpenseForm } from './ExpenseForm'
import { ExpenseDetailPanel } from './ExpenseDetail'
import { today } from '../../pages/arenaUi'
import type { ExpenseDetail, ExpenseList, ExpenseOptions, ExpenseRow } from './expenses'

const actor = vi.hoisted(() => ({ roles: ['Manager'], permissions: ['finance:read', 'finance:write'] }))
vi.mock('../auth/authContext', () => ({ useAuth: () => ({ user: { id: 'finance-test', roles: actor.roles, permissions: actor.permissions } }) }))
const day = today()
const partner = { id: '11111111-1111-1111-1111-111111111111', name: 'Sócio de teste' }
const row: ExpenseRow = { id: '22222222-2222-2222-2222-222222222222', description: 'Bebidas teste', kind: 'Expense', category: 'General', beneficiary: '', dueDate: null, expenseDate: day, amount: 600, paidAmount: 200, remainingAmount: 400, status: 'Partial', paidBy: 'Partner', partnerId: partner.id, partnerName: partner.name, teamMemberId: null, reference: null, origin: 'Bar', managed: true, purchaseId: null, version: 3 }
const detail: ExpenseDetail = { expense: row, payments: [{ operationId: '33333333-3333-3333-3333-333333333333', amount: 200, paidDate: day, paymentMethod: 'Pix', accountReference: 'Conta teste', createdAtUtc: `${day}T12:00:00Z` }], notes: '', documentReference: '' }
const options: ExpenseOptions = { partners: [partner], team: [{ id: 'monthly', name: 'Pessoa mensal teste', payAmount: 2000, payBasis: 'Valor mensal', paymentFrequency: 'Mensal', paymentDay: '5' }, { id: 'daily', name: 'Pessoa turno teste', payAmount: 120, payBasis: 'Por turno', paymentFrequency: 'Semanal', paymentDay: '' }], attachmentSupport: true }
const report: ExpenseList = { items: [row, { ...row, id: 'old', description: 'Energia teste', paidBy: 'Pending', partnerId: null, partnerName: null, dueDate: '2000-01-01', amount: 460, paidAmount: 0, remainingAmount: 460, status: 'Pending' }], summary: { outstandingAmount: 860, partnerAmount: 400, overdueAmount: 460, outstandingCount: 2 }, page: 1, pageSize: 20, total: 2, today: day }
const clients: QueryClient[] = []
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
function mount(children: ReactNode = <ExpensesPage />, path = '/financeiro/despesas') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client)
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>{children}</MemoryRouter></QueryClientProvider>)
}
function mockRequests(handler?: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    if (handler) { const result = await handler(url, init); if (result) return result }
    if (url.includes('/attachments')) return response([])
    if (url.endsWith('/options')) return response(options)
    if (url.includes('/expenses?')) return response(report)
    return response(detail)
  })
}
afterEach(() => { clients.splice(0).forEach(client => client.clear()); actor.roles = ['Manager']; actor.permissions = ['finance:read', 'finance:write']; vi.restoreAllMocks() })

it('mostra o saldo restante, os sócios incluídos no total e conserva resumo global ao filtrar', async () => {
  const fetch = mockRequests(); const user = userEvent.setup(); mount()
  const summary = await screen.findByRole('region', { name: 'Resumo de todas as pendências' })
  expect(summary).toHaveTextContent('R$ 860,00'); expect(summary).toHaveTextContent('R$ 400,00'); expect(summary).toHaveTextContent('Incluído no total em aberto')
  const table = screen.getByRole('table'); expect(table).toHaveTextContent('Parcial'); expect(table).toHaveTextContent('Vencido')
  expect(within(table).queryByText('R$ 600,00')).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Filtrar tipo de lançamento'), 'Partners')
  await waitFor(() => expect(fetch.mock.calls.some(([input]) => String(input).includes('filter=Partners'))).toBe(true))
  await user.click(screen.getByRole('button', { name: 'Concluídos' }))
  await waitFor(() => expect(fetch.mock.calls.some(([input]) => String(input).includes('state=Completed'))).toBe(true))
  expect(await screen.findByRole('columnheader', { name: 'Valor pago' })).toBeInTheDocument()
  expect(summary).toHaveTextContent('R$ 860,00')
})

it('restringe consulta e escrita ao atendente mesmo com claims financeiras antigas', async () => {
  const fetch = mockRequests(); actor.roles = ['Operations']; actor.permissions = []
  const first = mount(); expect(screen.getByText('Acesso restrito')).toBeInTheDocument(); expect(fetch).not.toHaveBeenCalled(); first.unmount()
  actor.permissions = ['finance:read']; mount()
  expect(screen.getByText('Acesso restrito')).toBeInTheDocument(); expect(fetch).not.toHaveBeenCalled(); expect(screen.queryByRole('button', { name: 'Novo lançamento' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Pagar / })).not.toBeInTheDocument()
})

it('salva despesa avulsa com valor decimal e só pede campos da situação escolhida', async () => {
  const fetch = mockRequests(); const user = userEvent.setup(); const saved = vi.fn(); mount(<ExpenseForm options={options} onClose={() => {}} onSaved={saved} />)
  await user.type(screen.getByLabelText('Descrição'), 'Material teste')
  await user.type(screen.getByLabelText('Valor devido (R$)'), '123,45')
  await user.selectOptions(screen.getByLabelText('Unidade'), 'quadra')
  expect(screen.getByLabelText('Vencimento')).toBeVisible(); expect(screen.queryByLabelText('Data do pagamento')).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Situação'), 'Company')
  expect(screen.queryByLabelText('Vencimento')).not.toBeInTheDocument(); expect(screen.getByLabelText('Data do pagamento')).toHaveValue(day)
  await user.click(screen.getByRole('button', { name: 'Salvar lançamento' }))
  await waitFor(() => expect(saved).toHaveBeenCalledOnce())
  const [, init] = fetch.mock.calls.find(([, request]) => request?.method === 'PUT')!
  expect(JSON.parse(String(init?.body))).toMatchObject({ description: 'Material teste', amount: 123.45, paidBy: 'Company', paidDate: day, dueDate: null, origin: 'Arena', allocationScope: 'Unit', businessUnitId: 'quadra' })
})

it('deriva mensal e diária do acordo, preenche valor e envia a referência correta', async () => {
  const fetch = mockRequests(); const user = userEvent.setup(); const saved = vi.fn(); mount(<ExpenseForm options={options} onClose={() => {}} onSaved={saved} />)
  await user.selectOptions(screen.getByLabelText('Lançamento'), 'Team')
  expect(screen.queryByLabelText('Descrição')).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Pessoa'), 'monthly')
  expect(screen.getByLabelText('Valor devido (R$)')).toHaveValue('2000,00'); expect(screen.getByLabelText('Mês trabalhado')).toHaveValue(day.slice(0, 7)); expect(screen.queryByLabelText('Formato')).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Pessoa'), 'daily')
  expect(screen.queryByLabelText('Mês trabalhado')).not.toBeInTheDocument(); expect(screen.getByLabelText('Valor devido (R$)')).toHaveValue('120,00')
  await user.type(screen.getByLabelText('Turno (opcional)'), 'Noite')
  await user.click(screen.getByRole('button', { name: 'Salvar lançamento' }))
  await waitFor(() => expect(saved).toHaveBeenCalledOnce())
  const [, init] = fetch.mock.calls.find(([, request]) => request?.method === 'PUT')!
  const payload = JSON.parse(String(init?.body)); expect(payload).toMatchObject({ kind: 'Team', amount: 120, teamMemberId: 'daily', teamBasis: 'Daily', workDate: day, shift: 'Noite' }); expect(payload).not.toHaveProperty('referenceMonth')
})

it('cadastra sócio no fluxo, gera pendência de reembolso e preserva rascunho em erro', async () => {
  let failures = 0
  const fetch = mockRequests(async (_url, init) => {
    if (init?.method === 'POST') return response({ id: 'new-partner', name: 'Novo sócio teste' })
    if (init?.method === 'PUT' && failures++ === 0) return response({ message: 'Falha de teste' }, 503)
    return response(detail)
  })
  const user = userEvent.setup(); const saved = vi.fn(); mount(<ExpenseForm options={options} onClose={() => {}} onSaved={saved} />)
  await user.type(screen.getByLabelText('Descrição'), 'Compra teste'); await user.type(screen.getByLabelText('Valor devido (R$)'), '600')
  await user.selectOptions(screen.getByLabelText('Situação'), 'Partner'); await user.click(screen.getByRole('button', { name: '+ Cadastrar sócio aqui' }))
  await user.type(screen.getByLabelText('Nome do sócio'), 'Novo sócio teste'); await user.click(screen.getByRole('button', { name: 'Cadastrar e selecionar' }))
  await waitFor(() => expect(screen.getByLabelText('Sócio que usou dinheiro próprio')).toHaveValue('new-partner'))
  await user.click(screen.getByRole('button', { name: 'Salvar lançamento' })); expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível confirmar o lançamento')
  expect(screen.getByLabelText('Descrição')).toHaveValue('Compra teste')
  await user.click(screen.getByRole('button', { name: 'Tentar confirmar novamente' })); await waitFor(() => expect(saved).toHaveBeenCalledOnce())
  const attempts = fetch.mock.calls.filter(([, init]) => init?.method === 'PUT')
  expect(attempts[0][0]).toBe(attempts[1][0]); expect(attempts[0][1]?.body).toBe(attempts[1][1]?.body)
  expect(JSON.parse(String(attempts[1][1]?.body))).toMatchObject({ paidBy: 'Partner', partnerId: 'new-partner', amount: 600, dueDate: null })
})

it('registra reembolso parcial com versão e repete a mesma operação depois de erro sem resposta', async () => {
  let count = 0
  const fetch = mockRequests(async (_url, init) => {
    if (init?.method === 'POST') { if (count++ === 0) throw new TypeError('Offline'); return response({ ...detail, expense: { ...row, paidAmount: 350, remainingAmount: 250, version: 4 } }) }
    return response(_url.includes('/attachments') ? [] : detail)
  })
  const user = userEvent.setup(); const saved = vi.fn(); mount(<ExpenseDetailPanel id={row.id} actor="test" canWrite onClose={() => {}} onPaid={saved} />)
  const value = await screen.findByLabelText('Valor devolvido (R$)'); expect(value).toHaveValue('400,00')
  await user.clear(value); await user.type(value, '150'); await user.click(screen.getByRole('button', { name: 'Confirmar reembolso' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível confirmar o pagamento'); expect(value).toHaveValue('150'); expect(value).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Tentar confirmar novamente' })); await waitFor(() => expect(saved).toHaveBeenCalledOnce())
  const attempts = fetch.mock.calls.filter(([, init]) => init?.method === 'POST')
  expect(attempts[0][1]?.body).toBe(attempts[1][1]?.body)
  expect(JSON.parse(String(attempts[1][1]?.body))).toMatchObject({ amount: 150, version: 3, paidDate: day })
})

it('não baixa saldo obsoleto e solicita atualização explícita sem perder a ficha', async () => {
  let latest = detail
  mockRequests(async (url, init) => {
    if (init?.method === 'POST') { latest = { ...detail, expense: { ...row, paidAmount: 300, remainingAmount: 300, version: 4 } }; return response({ message: 'Saldo alterado por outra pessoa.' }, 409) }
    return response(url.includes('/attachments') ? [] : latest)
  })
  const user = userEvent.setup(); mount(<ExpenseDetailPanel id={row.id} actor="test" canWrite onClose={() => {}} onPaid={() => {}} />)
  await user.click(await screen.findByRole('button', { name: 'Confirmar reembolso' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Saldo alterado por outra pessoa.'); expect(screen.getByRole('button', { name: 'Confirmar reembolso' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Atualizar saldo' }))
  await waitFor(() => expect(screen.getByLabelText('Valor devolvido (R$)')).toHaveValue('300,00'))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Confirmar reembolso' })).toBeEnabled()
})

it('protege fechamento do rascunho e aceita pagar lançamento anterior', async () => {
  mockRequests(async url => response(url.includes('/attachments') ? [] : { ...detail, expense: { ...row, managed: false } }))
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false); const close = vi.fn(); const user = userEvent.setup()
  mount(<ExpenseDetailPanel id={row.id} actor="test" canWrite onClose={close} onPaid={() => {}} />)
  const value = await screen.findByLabelText('Valor devolvido (R$)'); await user.clear(value); await user.type(value, '100')
  await user.click(screen.getByRole('button', { name: 'Fechar Detalhes do lançamento' }))
  expect(confirm).toHaveBeenCalled(); expect(close).not.toHaveBeenCalled(); expect(value).toHaveValue('100')
})

it('cancela somente pendência sem pagamentos, com motivo, versão e retry idempotente', async () => {
  const pending = { ...detail, payments: [], expense: { ...row, status: 'Pending', paidBy: 'Pending', partnerId: null, partnerName: null, paidAmount: 0, remainingAmount: 600 } } as ExpenseDetail
  let count = 0
  const fetch = mockRequests(async (url, init) => {
    if (url.endsWith('/cancel')) {
      if (count++ === 0) throw new TypeError('Offline')
      return response({ ...pending, cancellationReason: 'Lançamento duplicado', expense: { ...pending.expense, status: 'Canceled', remainingAmount: 0, version: 4 } })
    }
    return response(url.includes('/attachments') ? [] : pending)
  })
  const user = userEvent.setup(); const saved = vi.fn(); mount(<ExpenseDetailPanel id={row.id} actor="test" canWrite onClose={() => {}} onPaid={saved} />)
  await user.click(await screen.findByText('Corrigir lançamento')); await user.type(screen.getByLabelText('Motivo do cancelamento'), 'Lançamento duplicado')
  await user.click(screen.getByRole('button', { name: 'Cancelar lançamento' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível confirmar o cancelamento')
  expect(screen.getByLabelText('Motivo do cancelamento')).toHaveValue('Lançamento duplicado'); expect(screen.getByRole('button', { name: 'Confirmar pagamento' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Tentar confirmar cancelamento novamente' }))
  await waitFor(() => expect(saved).toHaveBeenCalledOnce())
  const attempts = fetch.mock.calls.filter(([url]) => String(url).endsWith('/cancel'))
  expect(attempts).toHaveLength(2); expect(attempts[0][1]?.body).toBe(attempts[1][1]?.body)
  expect(JSON.parse(String(attempts[0][1]?.body))).toMatchObject({ version: 3, reason: 'Lançamento duplicado' })
})

it('não oferece cancelamento de reembolso ou despesa parcialmente paga', async () => {
  mockRequests(); mount(<ExpenseDetailPanel id={row.id} actor="test" canWrite onClose={() => {}} onPaid={() => {}} />)
  await screen.findByLabelText('Valor devolvido (R$)')
  expect(screen.queryByText('Corrigir lançamento')).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Cancelar lançamento' })).not.toBeInTheDocument()
})

it('reaproveita os dados da compra cadastrada e envia o vínculo sem pedir redigitação', async () => {
  const fetch = mockRequests(); const saved = vi.fn(); const user = userEvent.setup()
  mount(<ExpenseForm options={options} purchase={{ id: 'purchase-test', description: 'Nota de compra teste', amount: 630.5, expenseDate: day, expenseId: null }} onClose={() => {}} onSaved={saved} />)
  expect(screen.getByText('Nota de compra teste')).toBeInTheDocument(); expect(screen.getByText('R$ 630,50')).toBeInTheDocument()
  expect(screen.queryByLabelText('Descrição')).not.toBeInTheDocument(); expect(screen.queryByLabelText('Valor devido (R$)')).not.toBeInTheDocument(); expect(screen.queryByLabelText('Unidade')).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Situação'), 'Partner'); await user.selectOptions(screen.getByLabelText('Sócio que usou dinheiro próprio'), partner.id)
  await user.click(screen.getByRole('button', { name: 'Salvar lançamento' })); await waitFor(() => expect(saved).toHaveBeenCalledOnce())
  const [, init] = fetch.mock.calls.find(([, request]) => request?.method === 'PUT')!
  expect(JSON.parse(String(init?.body))).toMatchObject({ description: 'Nota de compra teste', amount: 630.5, purchaseId: 'purchase-test', origin: 'Bar', allocationScope: 'Unit', businessUnitId: 'bar', paidBy: 'Partner', partnerId: partner.id })
})

it('abre a despesa existente ao consultar uma compra já vinculada, sem criar segundo lançamento', async () => {
  const fetch = mockRequests(url => response(url.includes('/purchase-options/') ? { id: 'purchase-test', description: 'Compra vinculada teste', amount: 600, expenseDate: day, expenseId: row.id } : url.endsWith('/options') ? options : url.includes('/expenses?') ? report : url.includes('/attachments') ? [] : detail))
  mount(<ExpensesPage />, '/financeiro/despesas?purchase=purchase-test')
  expect(await screen.findByLabelText('Valor devolvido (R$)')).toHaveValue('400,00')
  expect(screen.queryByRole('button', { name: 'Salvar lançamento' })).not.toBeInTheDocument()
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
})

it('carrega compra sem vínculo antes de abrir o formulário com valor e descrição preservados', async () => {
  const fetch = mockRequests(url => response(url.includes('/purchase-options/') ? { id: 'purchase-test', description: 'Compra preparada teste', amount: 630.5, expenseDate: day, expenseId: null } : url.endsWith('/options') ? options : url.includes('/expenses?') ? report : detail))
  mount(<ExpensesPage />, '/financeiro/despesas?purchase=purchase-test')
  await screen.findByRole('heading', { name: 'Compra preparada teste' })
  expect(screen.getByRole('button', { name: 'Salvar lançamento' })).toBeInTheDocument()
  expect(screen.queryByLabelText('Descrição')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Valor devido (R$)')).not.toBeInTheDocument()
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
})
