import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import type { AuthUser } from '../auth/types'
import { DashboardPage } from '../../pages/DashboardPage'
import { OwnerOverviewPage } from './OwnerOverviewPage'
import type { GoalEstimate, OwnerOverview } from './ownerOverviewApi'

const owner: AuthUser = { id: 'owner-overview-test', name: 'Dono de teste', email: 'owner@example.test', roles: ['Manager'], permissions: [], canManageStaff: true }
const price = (amount: number, multiplier: number): GoalEstimate => ({ estimatedMonthlyCents: amount * multiplier, averageMonthlyCents: amount, sampleCount: 2, priceReference: 'segment', usesFallback: true })
const missingPrice: GoalEstimate = { estimatedMonthlyCents: null, averageMonthlyCents: null, sampleCount: 0, priceReference: 'missing', usesFallback: false }
function report(): OwnerOverview {
  return {
    month: '2026-11', asOfDate: '2026-11-20', queriedAtUtc: '2026-11-20T15:00:00Z', timeZone: 'America/Sao_Paulo',
    school: { activeStudents: 2, activeEnrollments: 3, activeClasses: 2, knownMonthlyCents: 45000, priceSampleCount: 2, missingPriceCount: 1 },
    rentals: { activeGroups: 2, knownMonthlyCents: 110000, priceSampleCount: 1, missingPriceCount: 1 },
    recurring: { knownMonthlyCents: 155000, missingPriceCount: 2, schoolTargetMonthlyCents: 4725000, rentalTargetMonthlyCents: 1540000, targetMonthlyCents: 6265000, barTargetMonthlyCents: null },
    targets: { classesPerWeekday: 5, placesPerClass: 6, rentalGroupsPerWeekday: 2, weeklyClasses: 35, weeklyPlaces: 210, weeklyRentalGroups: 14 },
    weekdays: Array.from({ length: 7 }, (_, weekDay) => ({ weekDay, classes: [1, 2].includes(weekDay) ? 1 : 0, enrollmentPlaces: weekDay === 1 ? 2 : weekDay === 2 ? 1 : 0, rentalGroups: [1, 2].includes(weekDay) ? 1 : 0, schoolGoal: price(22500, 30), rentalGoal: price(110000, 2) })),
    finance: {
      school: { billedCents: 20000, receivedCents: 15000, outstandingCents: 5000, overdueCents: 4000, chargeCount: 2, partiallyPaidCount: 1, manualPaidCount: 0, overdueChargeCount: 1, basis: 'competence' },
      rentals: { billedCents: 40000, receivedCents: 10000, outstandingCents: 30000, overdueCents: 0, chargeCount: 1, partiallyPaidCount: 1, manualPaidCount: 1, overdueChargeCount: 0, basis: 'competence' },
      otherSchool: { billedCents: 7000, receivedCents: 5000, outstandingCents: 2000, overdueCents: 500, chargeCount: 2, partiallyPaidCount: 1, manualPaidCount: 0, overdueChargeCount: 1, basis: 'due-date' },
      bar: { consumedCents: 10000, grossReceivedCents: 9000, refundsCents: 1000, netReceivedCents: 8000, consumedItemCount: 3, receivedPaymentCount: 2, confirmedRefundCount: 1, basis: 'confirmation-date', source: 'bar-tabs' },
      barLegacy: { grossReceivedCents: 0, refundsCents: 0, netReceivedCents: 0, receivedEventCount: 0, refundEventCount: 0, basis: 'event-date', source: 'legacy-bar-events' },
    },
    warnings: [{ code: 'missing-price', count: 2, message: 'Há mensalidades a combinar na base ativa.' }],
  }
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const clients: QueryClient[] = []
function mount({ user = owner, path = '/?month=2026-11', direct = false }: { user?: AuthUser; path?: string; direct?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); clients.push(client)
  const auth: AuthContextValue = { user, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {} }
  return { client, ...render(<QueryClientProvider client={client}><AuthContext.Provider value={auth}><MemoryRouter initialEntries={[path]}>{direct ? <OwnerOverviewPage /> : <DashboardPage />}</MemoryRouter></AuthContext.Provider></QueryClientProvider>) }
}
afterEach(() => { clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks() })

it('abre a visão dos donos sem depender dos cadastros carregados pelo painel operacional', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(report()))
  mount()
  const school = await screen.findByRole('article', { name: 'Alunos' })
  expect(school).toHaveTextContent('2 alunos únicos com matrícula ativa')
  expect(school).toHaveTextContent('3 / 210 matrículas')
  expect(school).toHaveTextContent('2 / 35 turmas ativas')
  expect(school).toHaveTextContent('R$ 450,00')
  expect(school).toHaveTextContent('1 a combinar')
  expect(screen.getByRole('article', { name: 'Mensalistas' })).toHaveTextContent('2 grupos com contrato ativo')
  expect(screen.getByText('R$ 1.550,00')).toBeInTheDocument()
  const base = screen.getByRole('region', { name: 'Alunos e mensalistas' })
  expect(within(base).getByText('Meta recorrente estimada')).toBeVisible()
  expect(within(base).getByText('R$ 62.650,00')).toBeVisible()
  expect(screen.getByText(/Atualizado em 20\/11\/2026, 12:00/)).toBeInTheDocument()
  expect(screen.getByText(/Há mensalidades a combinar/)).toBeVisible()
  expect(screen.queryByRole('heading', { name: 'Hoje' })).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(String(fetch.mock.calls[0][0])).toBe('/api/v1/owner-overview?month=2026-11')
})

it('mantém competência das mensalidades e movimentos do Bar separados sem total financeiro artificial', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(report())); mount()
  const table = await screen.findByRole('table', { name: 'Mensalidades por competência' })
  const rows = within(table).getAllByRole('row')
  expect(rows[1]).toHaveTextContent('Mensalidades das aulas')
  expect(rows[1]).toHaveTextContent('R$ 200,00')
  expect(rows[1]).toHaveTextContent('R$ 150,00')
  expect(rows[1]).toHaveTextContent('R$ 50,00')
  expect(rows[1]).toHaveTextContent('Deste saldo, R$ 40,00 vencidos')
  expect(within(rows[1]).queryByText('R$ 90,00')).not.toBeInTheDocument()
  expect(rows[2]).toHaveTextContent('R$ 400,00')
  expect(rows[2]).toHaveTextContent('R$ 100,00')
  expect(rows[2]).toHaveTextContent('R$ 300,00')
  const bar = screen.getByRole('heading', { name: 'Bar no período' }).closest('.owner-finance-card') as HTMLElement
  expect(bar).toHaveTextContent('Consumo confirmadoR$ 100,00')
  expect(bar).toHaveTextContent('Recebido brutoR$ 90,00')
  expect(bar).toHaveTextContent('Estornos confirmadosR$ 10,00')
  expect(bar).toHaveTextContent('Recebido líquidoR$ 80,00')
  expect(screen.queryByText('R$ 330,00')).not.toBeInTheDocument()
  await userEvent.click(screen.getByText('Como ler as mensalidades', { selector: 'summary' }))
  expect(screen.getByText(/mesmo quando o pagamento ocorreu em outro mês/)).toBeVisible()
  expect(screen.getByText(/Inclui baixas manuais informadas/)).toBeVisible()
  expect(screen.getByRole('link', { name: 'Conferir Bar' })).toHaveAttribute('href', '/bar/indicadores?de=2026-11-01&ate=2026-11-30')
})

it('ordena as metas de segunda a domingo e distingue pessoas, matrículas e grupos', async () => {
  const value = report(); value.weekdays[1].classes = 6; value.weekdays[1].enrollmentPlaces = 36
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(value)); mount()
  const table = await screen.findByRole('table', { name: 'Metas por dia da semana' })
  expect(within(table).getAllByRole('rowheader').map(row => row.textContent)).toEqual(['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo', 'Semana completa'])
  expect(within(table).getByRole('meter', { name: 'Aulas de Segunda-feira' })).toHaveAttribute('aria-valuetext', '6 de 5 · acima da meta')
  expect(within(table).getByRole('meter', { name: 'Vagas de Segunda-feira' })).toHaveAttribute('aria-valuetext', '36 de 30 · acima da meta')
  expect(within(table).getByText('3 de 210')).toBeInTheDocument()
  expect(within(table).getByText('2 de 14')).toBeInTheDocument()
  expect(screen.getByText(/210 vagas corresponde a matrículas/)).toBeVisible()
  expect(screen.getByText('Sem meta em reais')).toBeInTheDocument()
  await userEvent.click(screen.getByText('Preços usados na estimativa das metas', { selector: 'summary' }))
  const estimates = screen.getByRole('table', { name: 'Estimativa de mensalidades por dia' })
  expect(within(estimates).getAllByText(/Usa a média do segmento/)).toHaveLength(14)
  expect(within(screen.getByRole('region', { name: 'Metas da semana' })).getByText('R$ 62.650,00')).toBeVisible()
})

it('preserva preços nulos como pendência e preços explicitamente zero como conhecidos', async () => {
  const value = report()
  value.school = { ...value.school, knownMonthlyCents: 0, priceSampleCount: 0, missingPriceCount: 3 }
  value.rentals = { ...value.rentals, knownMonthlyCents: 0, priceSampleCount: 2, missingPriceCount: 0 }
  value.recurring = { knownMonthlyCents: 0, missingPriceCount: 3, schoolTargetMonthlyCents: null, rentalTargetMonthlyCents: 0, targetMonthlyCents: null, barTargetMonthlyCents: null }
  value.weekdays = value.weekdays.map(row => ({ ...row, schoolGoal: missingPrice, rentalGoal: price(0, 2) }))
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(value)); mount()
  const school = await screen.findByRole('article', { name: 'Alunos' })
  expect(within(school).getByText('A combinar')).toBeInTheDocument()
  expect(within(school).queryByText('R$ 0,00')).not.toBeInTheDocument()
  const rental = screen.getByRole('article', { name: 'Mensalistas' })
  expect(within(rental).getByText('R$ 0,00')).toBeInTheDocument()
  expect(rental).toHaveTextContent('2 mensalidade(s) com valor definido')
  const goals = screen.getByRole('region', { name: 'Metas da semana' })
  expect(within(goals).getAllByText('Sem referência de preço').length).toBeGreaterThan(0)
})

it('identifica uma base vazia somente depois de uma resposta válida', async () => {
  const value = report()
  value.school = { activeStudents: 0, activeEnrollments: 0, activeClasses: 0, knownMonthlyCents: 0, priceSampleCount: 0, missingPriceCount: 0 }
  value.rentals = { activeGroups: 0, knownMonthlyCents: 0, priceSampleCount: 0, missingPriceCount: 0 }
  value.recurring = { knownMonthlyCents: 0, missingPriceCount: 0, schoolTargetMonthlyCents: null, rentalTargetMonthlyCents: null, targetMonthlyCents: null, barTargetMonthlyCents: null }
  value.weekdays = value.weekdays.map(row => ({ ...row, classes: 0, enrollmentPlaces: 0, rentalGroups: 0, schoolGoal: missingPrice, rentalGoal: missingPrice }))
  value.finance.school = value.finance.rentals = { billedCents: 0, receivedCents: 0, outstandingCents: 0, overdueCents: 0, chargeCount: 0, partiallyPaidCount: 0, manualPaidCount: 0, overdueChargeCount: 0, basis: 'competence' }
  value.finance.otherSchool = { ...value.finance.school, basis: 'due-date' }
  value.finance.bar = { consumedCents: 0, grossReceivedCents: 0, refundsCents: 0, netReceivedCents: 0, consumedItemCount: 0, receivedPaymentCount: 0, confirmedRefundCount: 0, basis: 'confirmation-date', source: 'bar-tabs' }
  value.warnings = []
  let resolve!: (response: Response) => void
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(done => { resolve = done })); mount()
  expect(screen.getByText('Carregando a visão geral da arena…')).toBeInTheDocument()
  expect(screen.queryByText('R$ 0,00')).not.toBeInTheDocument()
  expect(screen.queryByText('Nenhuma matrícula ativa nesta leitura.')).not.toBeInTheDocument()
  await act(async () => resolve(json(value)))
  expect(await screen.findByText('Nenhuma matrícula ativa nesta leitura.')).toBeVisible()
  expect(screen.getByText('Nenhum grupo mensalista ativo nesta leitura.')).toBeVisible()
  expect(screen.getByText('Nenhum consumo, pagamento ou estorno confirmado do Bar neste período.')).toBeVisible()
  expect(screen.getByText('Nenhuma outra cobrança de aulas com vencimento neste mês.')).toBeVisible()
  expect(screen.getByText('Vendas anteriores do Bar: nenhum recebimento ou estorno registrado neste mês.')).toBeVisible()
})

it('mostra aulas avulsas por vencimento e Bar antigo sem escondê-los no zero das comandas novas', async () => {
  const value = report()
  value.finance.bar = { consumedCents: 0, grossReceivedCents: 0, refundsCents: 0, netReceivedCents: 0, consumedItemCount: 0, receivedPaymentCount: 0, confirmedRefundCount: 0, basis: 'confirmation-date', source: 'bar-tabs' }
  value.finance.barLegacy = { grossReceivedCents: 125000, refundsCents: 20000, netReceivedCents: 105000, receivedEventCount: 5, refundEventCount: 1, basis: 'event-date', source: 'legacy-bar-events' }
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(value)); mount()
  const otherSchool = await screen.findByRole('table', { name: 'Outras receitas de aulas por vencimento' })
  expect(otherSchool).toHaveTextContent('R$ 70,00')
  expect(otherSchool).toHaveTextContent('R$ 50,00')
  expect(otherSchool).toHaveTextContent('R$ 20,00')
  expect(screen.getByText(/Vencimentos no mês · aulas avulsas/)).toBeVisible()
  const legacy = screen.getByRole('region', { name: 'Vendas anteriores do Bar' })
  expect(legacy).toHaveTextContent('R$ 1.250,00')
  expect(legacy).toHaveTextContent('R$ 200,00')
  expect(legacy).toHaveTextContent('R$ 1.050,00')
  expect(legacy).toHaveTextContent('Não somado ao bloco de comandas atuais')
  expect(screen.getByText('Nenhum consumo, pagamento ou estorno confirmado do Bar neste período.')).toBeVisible()
  expect(screen.queryByText('R$ 1.350,00')).not.toBeInTheDocument()
})

it('preserva o líquido negativo do Bar anterior em um mês somente com estorno', async () => {
  const value = report()
  value.finance.barLegacy = { grossReceivedCents: 0, refundsCents: 12000, netReceivedCents: -12000, receivedEventCount: 0, refundEventCount: 1, basis: 'event-date', source: 'legacy-bar-events' }
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(value)); mount()
  const legacy = await screen.findByRole('region', { name: 'Vendas anteriores do Bar' })
  expect(legacy).toHaveTextContent('-R$ 120,00')
  expect(legacy).toHaveTextContent('0 evento(s) de recebimento')
  expect(screen.queryByText('Vendas anteriores do Bar: nenhum recebimento ou estorno registrado neste mês.')).not.toBeInTheDocument()
})

it.each([
  { ...owner, canManageStaff: false },
  { ...owner, roles: ['Operations'] as AuthUser['roles'] },
  { ...owner, requiresFirstAccess: true },
])('não consulta nem mostra o painel gerencial sem a capacidade de dono: %j', async user => {
  const fetch = vi.spyOn(globalThis, 'fetch'); const { container } = mount({ user, direct: true })
  await act(async () => {})
  expect(fetch).not.toHaveBeenCalled()
  expect(container).toBeEmptyDOMElement()
})

it('troca a competência sem apresentar números do mês anterior como se fossem do mês escolhido', async () => {
  let resolveDecember!: (response: Response) => void
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(input => String(input).endsWith('2026-12') ? new Promise<Response>(done => { resolveDecember = done }) : Promise.resolve(json(report())))
  mount(); await screen.findByRole('article', { name: 'Alunos' })
  fireEvent.change(screen.getByLabelText('Competência financeira'), { target: { value: '2026-12' } })
  expect(await screen.findByText('Carregando a visão geral da arena…')).toBeInTheDocument()
  expect(screen.queryByRole('table', { name: 'Mensalidades por competência' })).not.toBeInTheDocument()
  const december = report(); december.month = '2026-12'; december.finance.school.billedCents = 76543
  await act(async () => resolveDecember(json(december)))
  expect(await screen.findByText('R$ 765,43')).toBeVisible()
  expect(screen.getByText(/Base ativa em 20\/11\/2026/)).toBeVisible()
  expect(String(fetch.mock.calls[1][0])).toBe('/api/v1/owner-overview?month=2026-12')
})

it('não consulta competência inválida e permite corrigi-la pelo campo', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(report())); mount({ path: '/?month=2026-13' })
  expect(screen.getByRole('alert')).toHaveTextContent('Escolha uma competência válida')
  expect(fetch).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Competência financeira'), { target: { value: '2026-11' } })
  expect(await screen.findByRole('article', { name: 'Alunos' })).toBeVisible()
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('mantém a leitura anterior com aviso quando a atualização falha', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(report())); mount()
  await screen.findByRole('article', { name: 'Alunos' }); fetch.mockResolvedValue(json({ message: 'Indisponível' }, 503))
  await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('A última leitura está preservada')
  expect(screen.getByRole('article', { name: 'Alunos' })).toHaveTextContent('R$ 450,00')
  expect(screen.getByText(/Última leitura preservada 20\/11\/2026/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeVisible()
})

it('oculta números antigos se uma nova consulta recebe acesso negado', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(report())); mount()
  await screen.findByRole('article', { name: 'Alunos' }); fetch.mockResolvedValue(json({ message: 'Acesso negado' }, 403))
  await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Sua conta não possui acesso')
  expect(screen.queryByRole('article', { name: 'Alunos' })).not.toBeInTheDocument()
  expect(screen.queryByText('R$ 450,00')).not.toBeInTheDocument()
})

it.each([{ month: '2026-11' }, { ...report(), month: '2026-10' }])('uma resposta incompleta ou de outra competência não vira zero: %j', async value => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(value)); mount()
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar a visão geral')
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(screen.queryByText('R$ 0,00')).not.toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar' })).toBeEnabled())
})

it.each(['fuso diferente', 'meta zero', 'vagas negativas', 'contagem financeira negativa'])('recusa indicadores incoerentes: %s', async scenario => {
  const value = report()
  if (scenario === 'fuso diferente') value.timeZone = 'UTC'
  if (scenario === 'meta zero') value.targets.weeklyPlaces = 0
  if (scenario === 'vagas negativas') value.weekdays[1].enrollmentPlaces = -1
  if (scenario === 'contagem financeira negativa') value.finance.barLegacy.refundEventCount = -1
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(value)); mount()
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar a visão geral')
  expect(screen.queryByRole('meter')).not.toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})
