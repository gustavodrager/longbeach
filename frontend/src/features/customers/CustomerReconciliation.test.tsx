import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { OptionalUnsavedProvider } from '../../components/managementUi'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import type { AuthUser } from '../auth/types'
import { CustomerReconciliation } from './CustomerReconciliation'
import type { Customer, CustomerMergeResult } from './api'

const manager: AuthUser = { id: 'manager-fixture', name: 'Gestão fictícia', email: 'manager@example.invalid', roles: ['Manager'], permissions: ['customers:read', 'customers:write', 'customers:merge'] }
const source: Customer = { id: 'source-fixture', name: 'Pessoa Origem', phone: '11988887777', email: null, status: 'Ativo', version: 3, origin: 'Manual', incomplete: false, userId: null, profiles: [], mergedIntoId: null }
const target: Customer = { ...source, id: 'target-fixture', name: 'Pessoa Mantida', version: 7 }
const preview = { sourceId: source.id, targetId: target.id, sourceVersion: 3, targetVersion: 7, previewToken: 'preview-fixture', canMerge: true, warnings: ['Os dados do destino serão mantidos.'], sourceLinks: 1, targetLinks: 2 }
const receipt: CustomerMergeResult = { mergeId: 'merge-fixture', customerId: target.id, aliasId: source.id, sourceVersion: 4, targetVersion: 8, undone: false }
const clients: QueryClient[] = []; const routers: ReturnType<typeof createMemoryRouter>[] = []
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }) }
function mount(customer?: Customer, user = manager) {
  const auth: AuthContextValue = { user, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {} }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client)
  const router = createMemoryRouter([{ path: '*', element: <AuthContext.Provider value={auth}><OptionalUnsavedProvider><CustomerReconciliation customer={customer} /></OptionalUnsavedProvider></AuthContext.Provider> }], { initialEntries: ['/clientes'] }); routers.push(router)
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
}
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); routers.splice(0).forEach(router => router.dispose()); sessionStorage.clear(); localStorage.clear(); vi.restoreAllMocks() })
async function inspectPair() {
  fireEvent.click(screen.getByRole('button', { name: 'Revisar duplicados e unificar' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Conferir estas duas pessoas' })); fireEvent.click(screen.getByRole('button', { name: 'Conferir impacto da unificação' })); await screen.findByRole('heading', { name: 'Conferência do impacto' })
}
function approvePair() {
  fireEvent.change(screen.getByLabelText('Motivo da unificação'), { target: { value: 'Conferência manual com a pessoa fictícia.' } }); fireEvent.click(screen.getByRole('checkbox', { name: /Conferi que é a mesma pessoa/ })); fireEvent.click(screen.getByRole('button', { name: 'Confirmar unificação' }))
}
function mergeMock(failed = false) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const path = String(url)
    if (path.endsWith('/duplicates')) return json([{ first: source, second: target, reasons: ['Nome semelhante para revisão'] }])
    if (path.endsWith('/merge/preview')) return json(preview)
    if (path.endsWith('/undo')) return json({ ...receipt, undone: true, sourceVersion: 5, targetVersion: 9 })
    if (path.endsWith('/merge') && init?.method === 'POST') return failed ? json({ message: 'A conferência ficou desatualizada.' }, 409) : json(receipt)
    throw new Error('Unexpected mocked request')
  })
}

it('sugestão não unifica automaticamente: exige preview, motivo e escolha explícita do destino', async () => {
  const fetch = mergeMock(); mount(); await inspectPair()
  expect(screen.getByRole('button', { name: 'Confirmar unificação' })).toBeDisabled(); expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/merge'))).toHaveLength(0)
  approvePair(); await screen.findByText('Unificação confirmada. O histórico original foi preservado.')
  const body = JSON.parse(String(fetch.mock.calls.find(([url]) => String(url).endsWith('/merge'))?.[1]?.body)); expect(body).toMatchObject({ sourceId: source.id, targetId: target.id, sourceVersion: 3, targetVersion: 7, previewToken: 'preview-fixture', reason: 'Conferência manual com a pessoa fictícia.' }); expect(body.operationId).toMatch(/^[a-f0-9-]{36}$/)
})

it('diferencia homônimos, exclui a outra ponta nas buscas e nunca seleciona a própria ficha', async () => {
  const first: Customer = { ...source, id: '00000000-0000-4000-8000-000000000001', name: 'Pessoa Homônima', origin: 'students', profiles: [] }
  const second: Customer = { ...target, id: '00000000-0000-4000-8000-000000000002', name: first.name, phone: first.phone, profiles: ['Bar'] }
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const path = String(url)
    if (path.endsWith('/duplicates')) return json([{ first, second, reasons: ['Nome e telefone semelhantes'] }])
    if (path.endsWith('/merge/preview')) return json({ ...preview, sourceId: first.id, targetId: second.id })
    if (init?.method) throw new Error('Unexpected mocked write')
    const items = new URL(path, 'http://fixture.invalid').searchParams.get('search') === 'Somente' ? [first] : [first, second]
    return json({ items, total: items.length, page: 1, pageSize: 20 })
  })
  mount(first); fireEvent.click(screen.getByRole('button', { name: 'Revisar duplicados e unificar' })); fireEvent.click(screen.getByText('Possíveis duplicados para conferência'))
  const pair = (await screen.findByText('Nome e telefone semelhantes')).closest('article')!
  expect(within(pair).getByText('Ref. 00000001 · Sem vínculo informado')).toBeVisible(); expect(within(pair).getByText('Ref. 00000002 · Vínculos: Bar')).toBeVisible(); expect(within(pair).queryByText(/Vínculos: Aluno/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Conferir impacto da unificação' })).toBeDisabled()
  const destination = within(screen.getByRole('group', { name: 'Cadastro a manter' }))
  fireEvent.change(destination.getByRole('searchbox'), { target: { value: 'Somente' } }); expect(await destination.findByText('Nenhum outro cadastro encontrado.')).toBeInTheDocument(); expect(destination.queryByRole('button', { name: /Pessoa Homônima/ })).not.toBeInTheDocument()
  fireEvent.change(destination.getByRole('searchbox'), { target: { value: 'Pessoa' } }); const other = await destination.findByRole('button', { name: /Pessoa Homônima.*Ref\. 00000002.*Vínculos: Bar/ }); expect(destination.queryByRole('button', { name: /Ref\. 00000001/ })).not.toBeInTheDocument(); fireEvent.click(other)
  const origin = within(screen.getByRole('group', { name: 'Cadastro de origem' })); fireEvent.click(origin.getByRole('button', { name: 'Escolher outra pessoa' })); fireEvent.change(origin.getByRole('searchbox'), { target: { value: 'Pessoa' } }); const original = await origin.findByRole('button', { name: /Pessoa Homônima.*Ref\. 00000001.*Sem vínculo informado/ }); expect(origin.queryByRole('button', { name: /Ref\. 00000002/ })).not.toBeInTheDocument(); fireEvent.click(original)
  fireEvent.click(screen.getByRole('button', { name: 'Conferir impacto da unificação' })); const impact = (await screen.findByRole('heading', { name: 'Conferência do impacto' })).closest('section')!; expect(within(impact).getByText('Pessoa Homônima · Ref. 00000001')).toBeVisible(); expect(within(impact).getByText('Pessoa Homônima · Ref. 00000002')).toBeVisible(); expect(within(impact).getByRole('checkbox', { name: /quero manter Pessoa Homônima · Ref\. 00000002/ })).not.toBeChecked()
  const request = fetch.mock.calls.find(([url]) => String(url).endsWith('/merge/preview')); expect(JSON.parse(String(request?.[1]?.body))).toEqual({ sourceId: first.id, targetId: second.id }); expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/merge'))).toBe(false)
})

it('conflito remove preview antigo e exige nova conferência sem reenviar o apply', async () => {
  const fetch = mergeMock(true); mount(); await inspectPair(); approvePair(); expect(await screen.findByRole('alert')).toHaveTextContent('nova conferência'); expect(screen.queryByRole('button', { name: 'Confirmar unificação' })).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Conferir impacto da unificação' })).toBeEnabled(); expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/merge'))).toHaveLength(1)
})

it('desfazer imediato usa as versões confirmadas do apply, nunca as do preview', async () => {
  const fetch = mergeMock(); mount(); await inspectPair(); approvePair(); fireEvent.click(await screen.findByRole('button', { name: 'Revisar retorno da última unificação' })); expect(screen.getByRole('heading', { name: 'Restaurar Pessoa Origem separado de Pessoa Mantida' })).toBeInTheDocument(); fireEvent.click(screen.getByRole('checkbox', { name: /Conferi a unificação indicada/ })); fireEvent.click(screen.getByRole('button', { name: 'Confirmar retorno da unificação' })); await screen.findByText('A última unificação foi desfeita.')
  const call = fetch.mock.calls.find(([url]) => String(url).endsWith('/undo')); expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ sourceVersion: 4, targetVersion: 8 })
})

it('recibo local de outra família não oferece retorno na ficha atual', () => {
  sessionStorage.setItem(`lb-customer-merge-receipt-v1:${manager.id}`, JSON.stringify({ ...receipt, sourceName: source.name, targetName: target.name })); const fetch = vi.spyOn(globalThis, 'fetch'); mount({ ...source, id: 'unrelated-customer', name: 'Outra pessoa' }); expect(screen.queryByRole('button', { name: 'Revisar retorno da última unificação' })).not.toBeInTheDocument(); expect(screen.queryByText('Pessoa Origem → Pessoa Mantida')).not.toBeInTheDocument(); expect(fetch).not.toHaveBeenCalled()
})

it('histórico persistente reabre retorno após reload com nomes e versões atuais do servidor', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => String(url).endsWith('/undo') ? json({ ...receipt, undone: true }) : init?.method ? Promise.reject(new Error('Unexpected mocked write')) : json([{ ...receipt, sourceName: source.name, targetName: target.name, sourceVersion: 10, targetVersion: 14 }, { ...receipt, mergeId: 'already-undone', sourceName: 'Outro cadastro', targetName: target.name, undone: true }]))
  mount(target); expect(fetch).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Consultar histórico de unificações' })); fireEvent.click(await screen.findByRole('button', { name: /^Revisar retorno de Pessoa Origem · Ref\./ })); expect(screen.getByRole('heading', { name: 'Restaurar Pessoa Origem separado de Pessoa Mantida' })).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Revisar retorno de Outro cadastro' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('checkbox', { name: /Conferi a unificação indicada/ })); fireEvent.click(screen.getByRole('button', { name: 'Confirmar retorno da unificação' })); await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/undo'))).toBe(true)); const call = fetch.mock.calls.find(([url]) => String(url).endsWith('/undo')); expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ sourceVersion: 10, targetVersion: 14 }); expect(String(fetch.mock.calls[0][0])).toBe(`/api/v1/customers/${target.id}/merges`)
})

it('não oferece reconciliação a operação ou Bar mesmo com claim merge', () => {
  const fetch = vi.spyOn(globalThis, 'fetch'); mount(source, { ...manager, roles: ['Operations'] }); expect(screen.queryByRole('heading', { name: 'Revisão do cadastro' })).not.toBeInTheDocument(); expect(fetch).not.toHaveBeenCalled()
})

it('backfill com origem inválida mostra conflito e impede qualquer aplicação', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ previewToken: 'old-fixture', sources: 3, create: 2, existing: 1, incomplete: 1, byKind: { students: 3 }, conflicts: [{ kind: 'students', sourceId: 'private-id-fixture', parentId: null, reason: 'Contato longo precisa de correção na origem.' }] }))
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Conferir cadastros antigos' })); fireEvent.click(screen.getByRole('button', { name: 'Preparar conferência' })); expect(await screen.findByRole('alert')).toHaveTextContent('Corrija as origens'); expect(screen.queryByRole('button', { name: 'Aplicar vínculos conferidos' })).not.toBeInTheDocument(); expect(screen.queryByText('private-id-fixture')).not.toBeInTheDocument(); expect(fetch).toHaveBeenCalledOnce()
})

it('backfill exige confirmação e repete a mesma aplicação incerta com token original', async () => {
  const bodies: unknown[] = []; vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => { if (init?.method === 'POST') { bodies.push(JSON.parse(String(init.body))); return bodies.length === 1 ? json({ message: 'Resposta perdida' }, 503) : json({ sources: 2, created: 2, linked: 2 }) } return json({ previewToken: 'backfill-fixture', sources: 2, create: 2, existing: 0, incomplete: 1, byKind: { students: 2 }, conflicts: [] }) })
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Conferir cadastros antigos' })); fireEvent.click(screen.getByRole('button', { name: 'Preparar conferência' })); const apply = await screen.findByRole('button', { name: 'Aplicar vínculos conferidos' }); expect(apply).toBeDisabled(); fireEvent.click(screen.getByRole('checkbox', { name: /Conferi o resultado/ })); fireEvent.click(apply); fireEvent.click(await screen.findByRole('button', { name: 'Conferir a mesma aplicação' })); expect(await screen.findByText('Concluído: 2 clientes criados e 2 vínculos registrados em 2 origens.')).toBeInTheDocument(); expect(bodies[1]).toEqual(bodies[0]); expect(bodies[0]).toMatchObject({ previewToken: 'backfill-fixture' })
})

it('backfill sem necessidade mantém aplicar desabilitado', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ previewToken: 'empty-fixture', sources: 1, create: 0, existing: 1, incomplete: 0, byKind: {}, conflicts: [] })); mount(); fireEvent.click(screen.getByRole('button', { name: 'Conferir cadastros antigos' })); fireEvent.click(screen.getByRole('button', { name: 'Preparar conferência' })); const dialog = screen.getByRole('dialog', { name: 'Conferir cadastros antigos' }); expect(await within(dialog).findByRole('button', { name: 'Aplicar vínculos conferidos' })).toBeDisabled()
})

it('backfill permite apenas completar vínculo de comanda em cliente existente, sem criar pessoa duplicada', async () => {
  const writes: unknown[] = []; vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => { if (init?.method === 'POST') { writes.push(JSON.parse(String(init.body))); return json({ sources: 2, created: 0, linked: 1 }) } return json({ previewToken: 'only-links-fixture', sources: 2, create: 0, existing: 1, incomplete: 0, byKind: { users: 1, barTabs: 1 }, conflicts: [] }) })
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Conferir cadastros antigos' })); fireEvent.click(screen.getByRole('button', { name: 'Preparar conferência' })); await screen.findByText('Comandas: 1'); expect(screen.queryByText('Nenhum vínculo pendente nesta conferência.')).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('checkbox', { name: /Conferi o resultado/ })); fireEvent.click(screen.getByRole('button', { name: 'Aplicar vínculos conferidos' })); expect(await screen.findByText('Concluído: 0 clientes criados e 1 vínculos registrados em 2 origens.')).toBeInTheDocument(); expect(writes[0]).toMatchObject({ previewToken: 'only-links-fixture' })
})
