import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import type { AuthUser } from '../auth/types'
import { useOperations, useOptionalOperations, type TeamMember } from '../operations/DemoDataProvider'
import { StaffTeamView } from './StaffTeamView'
import { InitialAccessReceipt } from './InitialAccessReceipt'
import type { StaffAccessStatus, StaffAccessType, StaffContext } from './api'

vi.mock('../operations/DemoDataProvider', () => ({ useOperations: vi.fn(), useOptionalOperations: vi.fn() }))

const teamId = '11111111-1111-4111-8111-111111111111'
const staffId = '22222222-2222-4222-8222-222222222222'
const person: TeamMember = { id: teamId, version: 1, name: 'Pessoa da equipe teste', phone: '11988887777', role: 'Bar', payAmount: null, payBasis: 'A combinar', paymentFrequency: 'A combinar', paymentDay: '', status: 'Ativo', notes: '' }
const owner: AuthUser = { id: 'owner-fixture', name: 'Dono teste', email: 'owner@example.invalid', roles: ['Manager'], permissions: [], canManageStaff: true }
const bar: StaffAccessType = { id: 'bar', name: 'Bar', role: 'Operations', menus: ['bar.sell', 'bar.tabs', 'bar.cash'], actions: ['bar.sell', 'bar.tabs', 'bar.cash'], memberCount: 2, version: 1 }
const status: StaffAccessStatus = { teamId, userId: staffId, typeId: 'bar', phoneLogin: '11988887777', username: null, isActive: true, requiresFirstAccess: false, initialAccessExpiresAtUtc: null, googleLinked: false, localPasswordEnabled: true, version: 1, isOwner: false }
const contexts = (): StaffContext => ({
  types: [bar, { ...bar, id: 'professor', name: 'Professor', role: 'Teacher', menus: ['teaching.today'], actions: [], memberCount: 0 }, { ...bar, id: 'atendente', name: 'Atendente', memberCount: 0 }, { ...bar, id: 'gestor', name: 'Gestor', role: 'Manager', menus: ['finance'], actions: [], memberCount: 0 }],
  catalog: {
    menus: [{ id: 'bar.sell', label: 'Vender', area: 'Bar', path: '/atendimento/vender', typeIds: ['bar', 'atendente', 'gestor'] }, { id: 'bar.tabs', label: 'Comandas', area: 'Bar', path: '/atendimento/comandas', typeIds: ['bar', 'atendente', 'gestor'] }, { id: 'bar.cash', label: 'Caixa', area: 'Bar', path: '/bar/caixa', typeIds: ['bar', 'atendente', 'gestor'] }, { id: 'teaching.today', label: 'Aulas de hoje', area: 'Aulas', path: '/professor', typeIds: ['professor'] }, { id: 'finance', label: 'Financeiro', area: 'Gestão', path: '/financeiro', typeIds: ['gestor'] }],
    actions: [{ id: 'bar.sell', label: 'Realizar vendas', menuId: 'bar.sell', typeIds: ['bar', 'atendente', 'gestor'] }, { id: 'bar.tabs', label: 'Operar comandas', menuId: 'bar.tabs', typeIds: ['bar', 'atendente', 'gestor'] }, { id: 'bar.cash', label: 'Operar próprio caixa', menuId: 'bar.cash', typeIds: ['bar', 'atendente', 'gestor'] }],
  }, members: [status],
  accounts: [{ id: staffId, name: 'Pessoa da equipe teste', username: 'staff-fixture', phoneLogin: null, role: 'Operations', isActive: true, googleLinked: true, localPasswordEnabled: false, linkedTeamId: null }, { id: '33333333-3333-4333-8333-333333333333', name: 'Professor existente teste', username: 'teacher-fixture', phoneLogin: null, role: 'Teacher', isActive: true, googleLinked: true, localPasswordEnabled: false, linkedTeamId: null }],
})
const clients: QueryClient[] = []
let context: StaffContext
let operations: ReturnType<typeof useOperations>
function json(body: unknown, code = 200) { return new Response(JSON.stringify(body), { status: code, headers: { 'Content-Type': 'application/json' } }) }
function mount(path = '/equipe', actor = owner) {
  let updateActor: (value: AuthUser) => void = () => {}
  function Session() {
    const [user, setUser] = useState(actor); updateActor = setUser
    const auth: AuthContextValue = { user, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {} }
    return <AuthContext.Provider value={auth}><MemoryRouter initialEntries={[path]}><Routes><Route path="/equipe" element={<StaffTeamView />} /><Route path={`/equipe/${teamId}`} element={<StaffTeamView detailId={teamId} />} /></Routes></MemoryRouter></AuthContext.Provider>
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client)
  render(<QueryClientProvider client={client}><Session /></QueryClientProvider>)
  return { actor: (value: AuthUser) => updateActor(value) }
}
async function readyButton(name: string) { const button = await screen.findByRole('button', { name }); await waitFor(() => expect(button).toBeEnabled()); return button }
async function newPerson() {
  fireEvent.click(await readyButton('+ Adicionar pessoa'))
  const editor = await screen.findByRole('dialog', { name: 'Pessoa da equipe' })
  fireEvent.change(within(editor).getByLabelText('Nome'), { target: { value: 'Nova pessoa teste' } })
  fireEvent.change(within(editor).getByLabelText('Telefone'), { target: { value: '(11) 97777-6666' } })
  fireEvent.change(within(editor).getByLabelText('Tipo de acesso'), { target: { value: 'bar' } })
  return editor
}
function mockApi(custom?: (url: string, init?: RequestInit) => Promise<Response> | Response | undefined) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const reply = custom?.(url, init)
    if (reply) return reply
    if (url.endsWith('/context')) return json(context)
    return json(status)
  })
}
beforeEach(() => {
  context = contexts()
  operations = { team: [person], canRead: () => true, canWrite: () => true, persistenceStatus: 'connected', dataUpdatedAt: '2026-11-04T00:00:00Z', reload: vi.fn().mockResolvedValue(undefined) } as unknown as ReturnType<typeof useOperations>
  vi.mocked(useOperations).mockReturnValue(operations)
  vi.mocked(useOptionalOperations).mockReturnValue(operations)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks() })

it('nega cadastro e configuração a Gestor sem a capacidade de dono, inclusive URL direta', async () => {
  const fetch = mockApi()
  mount('/equipe?acao=novo', { ...owner, canManageStaff: false })
  expect(await screen.findByText(person.name)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '+ Adicionar pessoa' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Tipos de acesso' })).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
})

it('cria ficha e conta juntas, impede duplo envio e mostra a senha somente no recibo em memória', async () => {
  const bodies: Record<string, unknown>[] = []
  let finish: ((value: Response) => void) | undefined
  mockApi((url, init) => { if (init?.method === 'PUT' && url.includes('/members/')) { bodies.push(JSON.parse(String(init.body))); return new Promise<Response>(resolve => { finish = resolve }) } })
  mount(); const editor = await newPerson()
  const save = within(editor).getByRole('button', { name: 'Salvar cadastro' })
  fireEvent.click(save); fireEvent.click(save)
  expect(bodies).toHaveLength(1)
  expect(bodies[0]).toMatchObject({ member: { name: 'Nova pessoa teste', phone: '11977776666' }, access: { mode: 'create', typeId: 'bar', phoneLogin: '11977776666', version: 0 } })
  expect(bodies[0]).not.toHaveProperty('password')
  expect(within(editor).getByLabelText('Nome')).toBeDisabled()
  expect(within(editor).getByLabelText('Observações do acordo')).toBeDisabled()
  const input = bodies[0] as { member: TeamMember }
  finish?.(json({ member: input.member, access: { ...status, teamId: input.member.id, requiresFirstAccess: true, phoneLogin: '11977776666' }, initialPassword: 'temporary-secret-fixture', initialPasswordExpiresAtUtc: '2026-11-05T12:00:00Z' }))
  const receipt = await screen.findByRole('dialog', { name: 'Acesso inicial' })
  expect(within(receipt).getByLabelText('Usuário')).toHaveValue('11977776666')
  expect(within(receipt).getByLabelText('Senha temporária')).toHaveValue('temporary-secret-fixture')
  expect(JSON.stringify(localStorage)).not.toContain('temporary-secret-fixture')
  expect(JSON.stringify(sessionStorage)).not.toContain('temporary-secret-fixture')
  fireEvent.click(within(receipt).getByRole('button', { name: 'Concluir' }))
  expect(screen.queryByLabelText('Senha temporária')).not.toBeInTheDocument()
})

it('alterar contato mantém o telefone de entrada existente e os métodos já vinculados', async () => {
  const bodies: Record<string, unknown>[] = []
  mockApi((url, init) => { if (init?.method === 'PUT' && url.includes('/members/')) { const body = JSON.parse(String(init.body)); bodies.push(body); return json({ member: body.member, access: { ...status, version: 2 } }) } })
  mount(`/equipe/${teamId}`)
  fireEvent.click(await readyButton('Editar dados'))
  const editor = await screen.findByRole('dialog', { name: 'Pessoa da equipe' })
  fireEvent.change(within(editor).getByLabelText('Telefone'), { target: { value: '11966665555' } })
  fireEvent.click(within(editor).getByRole('button', { name: 'Salvar cadastro' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Pessoa da equipe' })).not.toBeInTheDocument())
  expect(bodies[0]).toMatchObject({ member: { phone: '11966665555' }, access: { mode: 'keep', phoneLogin: status.phoneLogin, typeId: 'bar', version: 1 } })
  expect(bodies[0]).not.toHaveProperty('initialPassword')
  expect(screen.queryByRole('dialog', { name: 'Acesso inicial' })).not.toBeInTheDocument()
})

it('vincula conta compatível somente após seleção explícita e conserva Google', async () => {
  context.members = []
  const bodies: Record<string, unknown>[] = []
  mockApi((url, init) => { if (init?.method === 'PUT' && url.includes('/members/')) { const body = JSON.parse(String(init.body)); bodies.push(body); return json({ member: body.member, access: { ...status, googleLinked: true, localPasswordEnabled: false, typeId: 'professor' } }) } })
  mount(`/equipe/${teamId}`)
  fireEvent.click(await readyButton('Editar dados'))
  const editor = await screen.findByRole('dialog', { name: 'Pessoa da equipe' })
  fireEvent.change(within(editor).getByLabelText('Conta de acesso'), { target: { value: 'link' } })
  fireEvent.change(within(editor).getByLabelText('Tipo de acesso'), { target: { value: 'professor' } })
  expect(within(editor).getByLabelText('Conta existente')).toHaveValue('')
  expect(within(editor).queryByRole('option', { name: /Pessoa da equipe teste · staff-fixture/ })).not.toBeInTheDocument()
  fireEvent.change(within(editor).getByLabelText('Conta existente'), { target: { value: context.accounts[1].id } })
  fireEvent.click(within(editor).getByRole('button', { name: 'Salvar cadastro' }))
  await waitFor(() => expect(bodies).toHaveLength(1))
  expect(bodies[0]).toMatchObject({ access: { mode: 'link', userId: context.accounts[1].id, username: 'teacher-fixture', phoneLogin: null, typeId: 'professor' } })
  expect(screen.queryByLabelText('Senha temporária')).not.toBeInTheDocument()
})

it('preserva a solicitação após perda da resposta e não gera outra senha ao conferir o mesmo envio', async () => {
  const bodies: Record<string, unknown>[] = []
  mockApi((url, init) => {
    if (init?.method === 'PUT' && url.includes('/members/')) {
      const body = JSON.parse(String(init.body)); bodies.push(body)
      if (bodies.length === 1) return Promise.reject(new TypeError('Falha de rede de teste'))
      return json({ member: body.member, access: { ...status, teamId: body.member.id, requiresFirstAccess: true } })
    }
  })
  mount(); const editor = await newPerson()
  fireEvent.click(within(editor).getByRole('button', { name: 'Salvar cadastro' }))
  const retry = await screen.findByRole('button', { name: 'Reenviar mesma solicitação' })
  expect(within(editor).getByLabelText('Nome')).toBeDisabled()
  fireEvent.click(retry)
  await screen.findByText(/Cadastro confirmado\. A senha não pode ser consultada novamente/)
  expect(bodies).toHaveLength(2); expect(bodies[0]).toEqual(bodies[1])
  expect(screen.queryByLabelText('Senha temporária')).not.toBeInTheDocument()
})

it('configura menus e ações pelo catálogo sem abrir áreas de outro tipo e exige conferir o impacto', async () => {
  const writes: Record<string, unknown>[] = []
  mockApi((url, init) => { if (url.endsWith('/types/bar') && init?.method === 'PUT') { const body = JSON.parse(String(init.body)); writes.push(body); context.types[0] = { ...bar, ...body, version: 2 }; return json(context.types[0]) } })
  mount(); fireEvent.click(await readyButton('Tipos de acesso'))
  const panel = await screen.findByRole('dialog', { name: 'Tipos de acesso' })
  expect(within(panel).queryByLabelText('Financeiro')).not.toBeInTheDocument()
  expect(within(panel).getByText(/afeta 2 pessoas/)).toBeInTheDocument()
  const save = within(panel).getByRole('button', { name: 'Salvar tipo' }); expect(save).toBeDisabled()
  fireEvent.click(within(panel).getByLabelText('Comandas'))
  expect(within(panel).queryByLabelText('Operar comandas')).not.toBeInTheDocument()
  fireEvent.click(within(panel).getByLabelText('Conferi os acessos e as pessoas afetadas.'))
  fireEvent.click(save)
  await waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0]).toMatchObject({ version: 1, menus: ['bar.sell', 'bar.cash'], actions: ['bar.sell', 'bar.cash'] })
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tipos de acesso' })).not.toBeInTheDocument())
})

it('obriga atualizar o tipo depois de erro sem confirmar para evitar sobrescrever uma alteração já salva', async () => {
  const writes: unknown[] = []
  mockApi((url, init) => { if (url.endsWith('/types/bar') && init?.method === 'PUT') { const body = JSON.parse(String(init.body)); writes.push(body); context.types[0] = { ...bar, ...body, version: 2 }; return Promise.reject(new TypeError('Resposta perdida')) } })
  mount(); fireEvent.click(await readyButton('Tipos de acesso'))
  const panel = await screen.findByRole('dialog', { name: 'Tipos de acesso' })
  fireEvent.change(within(panel).getByLabelText('Nome do tipo'), { target: { value: 'Bar atendimento' } })
  fireEvent.click(within(panel).getByLabelText('Conferi os acessos e as pessoas afetadas.'))
  fireEvent.click(within(panel).getByRole('button', { name: 'Salvar tipo' }))
  const refresh = await screen.findByRole('button', { name: 'Atualizar tipos' })
  expect(within(panel).getByRole('button', { name: 'Salvar tipo' })).toBeDisabled()
  fireEvent.click(refresh)
  await waitFor(() => expect(screen.getByLabelText('Nome do tipo')).toHaveValue('Bar atendimento'))
  expect(writes).toHaveLength(1)
})

it('mostra consequência e exige conferência antes de emitir nova senha, sem guardar a senha no contexto', async () => {
  const writes: unknown[] = []
  mockApi((url, init) => { if (url.endsWith('/reset') && init?.method === 'POST') { writes.push(JSON.parse(String(init.body))); return json({ member: person, access: { ...status, requiresFirstAccess: true }, initialPassword: 'reset-secret-fixture' }) } })
  mount(`/equipe/${teamId}`)
  fireEvent.click(await screen.findByRole('button', { name: 'Gerar senha inicial' }))
  const panel = screen.getByRole('dialog', { name: 'Gerar senha inicial' })
  expect(within(panel).getByText(/As sessões atuais serão encerradas/)).toBeVisible()
  const submit = within(panel).getByRole('button', { name: 'Gerar senha inicial' }); expect(submit).toBeDisabled()
  fireEvent.click(within(panel).getByLabelText('Conferi a identidade e a entrega do acesso à pessoa.'))
  fireEvent.click(submit); fireEvent.click(submit)
  const receipt = await screen.findByRole('dialog', { name: 'Acesso inicial' })
  expect(within(receipt).getByLabelText('Senha temporária')).toHaveValue('reset-secret-fixture')
  expect(writes).toHaveLength(1); expect(writes[0]).toMatchObject({ version: 1 })
  expect(JSON.stringify(clients[0].getQueryCache().getAll().map(query => query.state.data))).not.toContain('reset-secret-fixture')
})

it('não oferece bloqueio ou senha inicial para conta dos donos e preserva seus campos administrativos', async () => {
  context.members = [{ ...status, isOwner: true, typeId: 'gestor' }]
  mockApi(); mount(`/equipe/${teamId}`)
  await screen.findByText('Conta administrativa dos donos.')
  expect(screen.queryByRole('button', { name: 'Gerar senha inicial' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Bloquear acesso' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Editar dados' }))
  const panel = screen.getByRole('dialog', { name: 'Pessoa da equipe' })
  expect(within(panel).getByLabelText('Situação')).toBeDisabled()
  expect(within(panel).getByLabelText('Tipo de acesso')).toBeDisabled()
  expect(within(panel).getByLabelText('Entrada da conta')).toBeDisabled()
})

it('descarta uma resposta antiga com senha se outra conta entrar enquanto a criação está pendente', async () => {
  let finish: ((value: Response) => void) | undefined
  let submitted: { member: TeamMember } | undefined
  mockApi((url, init) => { if (init?.method === 'PUT' && url.includes('/members/')) { submitted = JSON.parse(String(init.body)); return new Promise<Response>(resolve => { finish = resolve }) } })
  const session = mount(); const editor = await newPerson()
  fireEvent.click(within(editor).getByRole('button', { name: 'Salvar cadastro' }))
  act(() => session.actor({ ...owner, id: 'another-owner-fixture' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Pessoa da equipe' })).not.toBeInTheDocument())
  await act(async () => finish?.(json({ member: submitted!.member, access: status, initialPassword: 'must-not-leak-fixture' })))
  expect(screen.queryByLabelText('Senha temporária')).not.toBeInTheDocument()
  expect(document.body).not.toHaveTextContent('must-not-leak-fixture')
})

it('mantém escrita bloqueada quando o contexto de acessos falha, sem recorrer ao cadastro genérico', async () => {
  const fetch = mockApi(url => url.endsWith('/context') ? json({ detail: 'Acessos indisponíveis.' }, 503) : undefined)
  mount()
  await screen.findByText('Acessos indisponíveis.')
  expect(screen.getByRole('button', { name: '+ Adicionar pessoa' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Tipos de acesso' })).toBeDisabled()
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
})

it('descarta a senha pendente quando a capacidade de dono da mesma conta é revogada', async () => {
  let finish: ((value: Response) => void) | undefined
  let submitted: { member: TeamMember } | undefined
  mockApi((url, init) => { if (init?.method === 'PUT' && url.includes('/members/')) { submitted = JSON.parse(String(init.body)); return new Promise<Response>(resolve => { finish = resolve }) } })
  const session = mount(); const editor = await newPerson()
  fireEvent.click(within(editor).getByRole('button', { name: 'Salvar cadastro' }))
  act(() => session.actor({ ...owner, canManageStaff: false }))
  expect(screen.queryByRole('button', { name: 'Tipos de acesso' })).not.toBeInTheDocument()
  await act(async () => finish?.(json({ member: submitted!.member, access: status, initialPassword: 'must-not-leak-after-revocation' })))
  expect(screen.queryByLabelText('Senha temporária')).not.toBeInTheDocument()
})

it('limpa o recibo quando menus ou ações da mesma conta mudam, mesmo preservando papéis e permissões', async () => {
  mockApi((url, init) => { if (url.endsWith('/reset') && init?.method === 'POST') return json({ member: person, access: status, initialPassword: 'scope-secret-fixture' }) })
  const initial: AuthUser = { ...owner, staffAccess: { typeId: 'gestor', name: 'Gestor', role: 'Manager', menus: ['administration'], actions: [], homePath: '/equipe' } }
  const session = mount(`/equipe/${teamId}`, initial)
  fireEvent.click(await screen.findByRole('button', { name: 'Gerar senha inicial' }))
  const panel = screen.getByRole('dialog', { name: 'Gerar senha inicial' })
  fireEvent.click(within(panel).getByLabelText('Conferi a identidade e a entrega do acesso à pessoa.'))
  fireEvent.click(within(panel).getByRole('button', { name: 'Gerar senha inicial' }))
  await screen.findByLabelText('Senha temporária')
  act(() => session.actor({ ...initial, staffAccess: { ...initial.staffAccess!, menus: ['finance'] } }))
  expect(screen.queryByLabelText('Senha temporária')).not.toBeInTheDocument()
})

it('não exibe nem copia uma senha temporária que já expirou', () => {
  render(<InitialAccessReceipt name="Pessoa teste" login="staff-fixture" password="expired-secret-fixture" expiresAt="2000-01-01T00:00:00Z" onClose={() => {}} />)
  expect(screen.getByRole('alert')).toHaveTextContent('A senha temporária expirou')
  expect(screen.queryByLabelText('Senha temporária')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Copiar acesso' })).toBeDisabled()
})

it('explica o pacote completo de supervisão antes de conceder a ação crítica', async () => {
  context.catalog.actions.push({ id: 'bar.supervise', label: 'Supervisionar comandas e caixas', menuId: 'bar.tabs', typeIds: ['gestor'] })
  mockApi(); mount(); fireEvent.click(await readyButton('Tipos de acesso'))
  let panel = await screen.findByRole('dialog', { name: 'Tipos de acesso' })
  fireEvent.change(within(panel).getByLabelText('Tipo de acesso'), { target: { value: 'gestor' } })
  panel = await screen.findByRole('dialog', { name: 'Tipos de acesso' })
  fireEvent.click(within(panel).getByLabelText('Comandas'))
  expect(within(panel).getByLabelText('Supervisionar comandas e caixas')).not.toBeChecked()
  expect(within(panel).getByText(/Inclui descontos, cortesias, correções de itens/)).toBeVisible()
  expect(within(panel).getByText(/reabertura e consulta de outros caixas e aprovações de estoque/)).toBeVisible()
})

it('liga a operação obrigatória aos menus operacionais e a remove ao desmarcar o menu', async () => {
  const writes: Record<string, unknown>[] = []
  context.types[0] = { ...bar, menus: ['bar.tabs'], actions: [] }
  mockApi((url, init) => { if (url.endsWith('/types/bar') && init?.method === 'PUT') { const body = JSON.parse(String(init.body)); writes.push(body); return json({ ...context.types[0], ...body, version: 2 }) } })
  mount(); fireEvent.click(await readyButton('Tipos de acesso'))
  const panel = await screen.findByRole('dialog', { name: 'Tipos de acesso' })
  expect(within(panel).getByLabelText('Operar comandas')).not.toBeChecked()
  fireEvent.click(within(panel).getByLabelText('Vender'))
  expect(within(panel).getByText('Inclui registrar vendas.')).toBeVisible()
  expect(within(panel).queryByLabelText('Realizar vendas')).not.toBeInTheDocument()
  fireEvent.click(within(panel).getByLabelText('Caixa'))
  expect(within(panel).getByText('Inclui abrir, operar e fechar o próprio caixa.')).toBeVisible()
  fireEvent.click(within(panel).getByLabelText('Vender'))
  fireEvent.click(within(panel).getByLabelText('Conferi os acessos e as pessoas afetadas.'))
  fireEvent.click(within(panel).getByRole('button', { name: 'Salvar tipo' }))
  await waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0]).toMatchObject({ menus: ['bar.tabs', 'bar.cash'], actions: ['bar.cash'] })
})

it('atualiza uma ficha em conflito antes de permitir outra ação sobre o acesso', async () => {
  const writes: unknown[] = []
  mockApi((url, init) => { if (url.endsWith('/reset') && init?.method === 'POST') { writes.push(JSON.parse(String(init.body))); context.members = [{ ...status, version: 2 }]; return json({ detail: 'O acesso foi alterado.' }, 409) } })
  mount(`/equipe/${teamId}`)
  fireEvent.click(await screen.findByRole('button', { name: 'Gerar senha inicial' }))
  const panel = screen.getByRole('dialog', { name: 'Gerar senha inicial' })
  fireEvent.click(within(panel).getByLabelText('Conferi a identidade e a entrega do acesso à pessoa.'))
  fireEvent.click(within(panel).getByRole('button', { name: 'Gerar senha inicial' }))
  fireEvent.click(await within(panel).findByRole('button', { name: 'Atualizar ficha' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Gerar senha inicial' })).not.toBeInTheDocument())
  expect(writes).toHaveLength(1)
  expect(operations.reload).toHaveBeenCalledTimes(1)
  expect(screen.queryByLabelText('Senha temporária')).not.toBeInTheDocument()
})

it('não confirma uma edição perdida consultando apenas a existência da conta anterior', async () => {
  const writes: Record<string, unknown>[] = []
  mockApi((url, init) => { if (url.includes('/members/') && init?.method === 'PUT') { const body = JSON.parse(String(init.body)); writes.push(body); if (writes.length === 1) return Promise.reject(new TypeError('Resposta perdida')); return json({ member: body.member, access: { ...status, version: 2 } }) } })
  mount(`/equipe/${teamId}`)
  fireEvent.click(await readyButton('Editar dados'))
  const panel = screen.getByRole('dialog', { name: 'Pessoa da equipe' })
  fireEvent.change(within(panel).getByLabelText('Nome'), { target: { value: 'Nome atualizado teste' } })
  fireEvent.click(within(panel).getByRole('button', { name: 'Salvar cadastro' }))
  const retry = await within(panel).findByRole('button', { name: 'Reenviar mesma solicitação' })
  expect(within(panel).queryByRole('button', { name: 'Conferir cadastro' })).not.toBeInTheDocument()
  expect(screen.queryByText('Cadastro salvo.')).not.toBeInTheDocument()
  fireEvent.click(retry)
  await screen.findByText('Cadastro salvo.')
  expect(writes).toHaveLength(2)
  expect(writes[0]).toEqual(writes[1])
})

it('exige reativar uma conta bloqueada antes de gerar outra senha inicial', async () => {
  context.members = [{ ...status, isActive: false }]
  mockApi(); mount(`/equipe/${teamId}`)
  expect(await screen.findByRole('button', { name: 'Gerar senha inicial' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Reativar acesso' })).toBeEnabled()
  expect(screen.getByText('Reative o acesso antes de gerar uma nova senha inicial.')).toBeVisible()
})

it.each([
  { menu: 'customers', label: 'Clientes', action: 'customers.merge', actionLabel: 'Unificar clientes' },
  { menu: 'materials', label: 'Materiais', action: 'materials.adjust', actionLabel: 'Corrigir saldo de materiais' },
  { menu: 'stock', label: 'Estoque e compras', action: 'stock.fiscal', actionLabel: 'Importar notas fiscais' },
])('exige a operação de $label para conceder $actionLabel e remove a ação crítica ao retirar a operação', async ({ menu, label, action, actionLabel }) => {
  context.types[3] = { ...context.types[3], menus: [menu], actions: [] }
  context.catalog.menus.push({ id: menu, label, area: 'Gestão', path: '/teste', typeIds: ['gestor'] })
  context.catalog.actions.push({ id: menu + '.operate', label: 'Alterar', menuId: menu, typeIds: ['gestor'] }, { id: action, label: actionLabel, menuId: menu, typeIds: ['gestor'], requiresActions: [menu + '.operate'] })
  const writes: Record<string, unknown>[] = []
  mockApi((url, init) => { if (url.endsWith('/types/gestor') && init?.method === 'PUT') { const body = JSON.parse(String(init.body)); writes.push(body); return json({ ...context.types[3], ...body, version: 2 }) } })
  mount(); fireEvent.click(await readyButton('Tipos de acesso'))
  fireEvent.change(screen.getByLabelText('Tipo de acesso'), { target: { value: 'gestor' } })
  const panel = screen.getByRole('dialog', { name: 'Tipos de acesso' })
  const critical = within(panel).getByLabelText(actionLabel)
  const operate = within(panel).getByLabelText(`Alterar ${label.toLocaleLowerCase('pt-BR')}`)
  expect(critical).toBeDisabled()
  fireEvent.click(operate); expect(critical).toBeEnabled()
  fireEvent.click(critical); expect(critical).toBeChecked()
  fireEvent.click(operate); expect(critical).not.toBeChecked(); expect(critical).toBeDisabled()
  fireEvent.click(within(panel).getByLabelText('Conferi os acessos e as pessoas afetadas.'))
  fireEvent.click(within(panel).getByRole('button', { name: 'Salvar tipo' }))
  await waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0]).toMatchObject({ menus: [menu], actions: [] })
})
