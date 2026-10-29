import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import type { AuthUser } from '../auth/types'
import { CustomerPicker } from './CustomerPicker'
import type { Customer, CustomerLookup, CustomerScope } from './api'

const operator: AuthUser = { id: 'operator-fixture', name: 'Atendimento teste', email: 'operator@example.invalid', roles: ['Operations'], permissions: ['bar:sales:operate'] }
const customer: Customer = { id: 'customer-fixture', name: 'Pessoa Teste', phone: '11988887777', email: null, status: 'Ativo', version: 1, origin: 'Manual', incomplete: false, userId: null, profiles: [], mergedIntoId: null }
const clients: QueryClient[] = []
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }) }
function auth(user: AuthUser | null): AuthContextValue { return { user, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {} } }
function mount(content: ReactNode, actor: AuthUser | null = operator) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client)
  const tree = (user: AuthUser | null) => <QueryClientProvider client={client}><AuthContext.Provider value={auth(user)}>{content}</AuthContext.Provider></QueryClientProvider>
  const view = render(tree(actor))
  return { ...view, actor: (user: AuthUser | null) => view.rerender(tree(user)) }
}
function Host({ selected, required = false, submit = () => {}, scope = 'bar' }: { selected?: (value: CustomerLookup | null) => void; required?: boolean; submit?: () => void; scope?: CustomerScope }) {
  const [value, setValue] = useState<CustomerLookup | null>(null)
  return <form onSubmit={event => { event.preventDefault(); submit() }}><label>Produtos já escolhidos<input defaultValue="Água e suco" /></label><CustomerPicker scope={scope} value={value} required={required} onChange={person => { setValue(person); selected?.(person) }} /><button type="submit">Salvar atendimento</button></form>
}
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks() })

it('pesquisa somente DTO mínimo do escopo, diferencia homônimos e aceita cadastro antigo pendente', async () => {
  const selected = vi.fn()
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json([{ id: 'one', name: 'Pessoa Teste', phoneHint: '•••• 1111', incomplete: false }, { id: 'two', name: 'Pessoa Teste', phoneHint: '', incomplete: true }]))
  mount(<Host selected={selected} required />)
  fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'Pessoa' } })
  const second = await screen.findByRole('button', { name: /Pessoa Teste.*Telefone pendente.*Cadastro incompleto/ })
  fireEvent.click(second)
  expect(selected).toHaveBeenCalledWith({ id: 'two', name: 'Pessoa Teste', phoneHint: '', incomplete: true })
  expect(screen.getByText('Telefone pendente')).toBeInTheDocument()
  expect(fetch.mock.calls.every(([url]) => String(url).startsWith('/api/v1/customers/lookup?scope=bar&search='))).toBe(true)
})

it('mesmo nome e telefone mascarado continuam distinguíveis por referência sem solicitar dados extras', async () => {
  const people: CustomerLookup[] = [1, 2].map(number => ({ id: `00000000-0000-4000-8000-00000000000${number}`, name: 'Pessoa Homônima', phoneHint: '•••• 7777', incomplete: false }))
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(people)); const selected = vi.fn(); mount(<Host selected={selected} />)
  fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'Pessoa' } }); const second = await screen.findByRole('button', { name: 'Pessoa Homônima · •••• 7777 · Ref. 00000002' }); expect(screen.getByRole('button', { name: 'Pessoa Homônima · •••• 7777 · Ref. 00000001' })).toBeInTheDocument(); expect(selected).not.toHaveBeenCalled(); fireEvent.click(second)
  expect(selected).toHaveBeenCalledWith(people[1]); expect(within(screen.getByRole('group', { name: 'Cliente' })).getByText('Ref. 00000002')).toBeVisible(); expect(fetch).toHaveBeenCalledOnce(); expect(String(fetch.mock.calls[0][0])).toContain('/customers/lookup?scope=bar&search=Pessoa')
})

it('não pesquisa menos de três caracteres e resposta antiga não substitui busca nova', async () => {
  let completeOld: ((response: Response) => void) | undefined
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => String(url).includes('search=Antigo') ? new Promise<Response>(resolve => { completeOld = resolve }) : json([{ id: 'new', name: 'Cadastro Atual', phoneHint: '•••• 2222', incomplete: false }]))
  mount(<Host />)
  fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'An' } })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 330)) }); expect(fetch).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'Antigo' } }); await waitFor(() => expect(completeOld).toBeDefined())
  fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'Atual' } })
  expect(await screen.findByRole('button', { name: /Cadastro Atual/ })).toBeInTheDocument()
  await act(async () => { completeOld?.(json([{ id: 'old', name: 'Cadastro Antigo', phoneHint: '•••• 1111', incomplete: false }])) })
  await waitFor(() => expect(screen.queryByRole('button', { name: /Cadastro Antigo/ })).not.toBeInTheDocument())
})

it('cria e seleciona uma vez sem enviar formulário principal nem perder produtos', async () => {
  let finish: ((response: Response) => void) | undefined
  const bodies: Record<string, unknown>[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => { if (init?.method === 'POST') { bodies.push(JSON.parse(String(init.body))); return new Promise<Response>(resolve => { finish = resolve }) } return json([]) })
  const selected = vi.fn(), submit = vi.fn()
  mount(<Host selected={selected} submit={submit} />)
  fireEvent.click(screen.getByRole('button', { name: '+ Cadastrar cliente' }))
  fireEvent.change(screen.getByLabelText('Nome do novo cliente'), { target: { value: ' Pessoa Teste ' } })
  fireEvent.change(screen.getByLabelText('Telefone do novo cliente'), { target: { value: '(11) 98888-7777' } })
  const create = screen.getByRole('button', { name: 'Cadastrar e selecionar' })
  fireEvent.click(create); fireEvent.click(create)
  expect(document.querySelectorAll('form')).toHaveLength(1)
  expect(bodies).toHaveLength(1); expect(bodies[0]).toMatchObject({ name: 'Pessoa Teste', phone: '11988887777' })
  expect(selected).not.toHaveBeenCalled(); expect(submit).not.toHaveBeenCalled()
  finish?.(json(customer)); await waitFor(() => expect(selected).toHaveBeenCalledTimes(1))
  expect(selected.mock.calls[0][0]).toEqual({ id: customer.id, name: customer.name, phoneHint: '•••• 7777', incomplete: false })
  expect(screen.getByLabelText('Produtos já escolhidos')).toHaveValue('Água e suco')
})

it('nome/telefone são obrigatórios no novo cadastro e Enter não envia o atendimento', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json([])), submit = vi.fn()
  mount(<Host submit={submit} required />); fireEvent.click(screen.getByRole('button', { name: '+ Cadastrar cliente' }))
  fireEvent.change(screen.getByLabelText('Nome do novo cliente'), { target: { value: 'Pessoa' } })
  fireEvent.keyDown(screen.getByLabelText('Telefone do novo cliente'), { key: 'Enter' })
  expect(screen.getByRole('alert')).toHaveTextContent('nome e um telefone')
  expect(fetch).not.toHaveBeenCalled(); expect(submit).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Salvar atendimento' })); expect(submit).not.toHaveBeenCalled()
})

it('erro409 preserva campos e não seleciona um cadastro presumido', async () => {
  const selected = vi.fn(); vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ message: 'Confira o cliente antes de repetir.' }, 409))
  mount(<Host selected={selected} />); fireEvent.click(screen.getByRole('button', { name: '+ Cadastrar cliente' }))
  fireEvent.change(screen.getByLabelText('Nome do novo cliente'), { target: { value: customer.name } }); fireEvent.change(screen.getByLabelText('Telefone do novo cliente'), { target: { value: customer.phone } })
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrar e selecionar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('formulário foi preservado')
  expect(screen.getByLabelText('Nome do novo cliente')).toHaveValue(customer.name); expect(screen.getByLabelText('Telefone do novo cliente')).toHaveValue(customer.phone); expect(selected).not.toHaveBeenCalled()
})

it('falha de rede repete o mesmo operationId e cancelar cadastro rápido preserva o pai', async () => {
  const bodies: Record<string, unknown>[] = []; const selected = vi.fn()
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return bodies.length === 1 ? json({ message: 'Confirmação interrompida' }, 503) : json(customer) })
  mount(<Host selected={selected} />); fireEvent.click(screen.getByRole('button', { name: '+ Cadastrar cliente' })); fireEvent.change(screen.getByLabelText('Nome do novo cliente'), { target: { value: customer.name } }); fireEvent.change(screen.getByLabelText('Telefone do novo cliente'), { target: { value: customer.phone } })
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrar e selecionar' })); await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: 'Conferir criação pendente' })); await waitFor(() => expect(selected).toHaveBeenCalledTimes(1)); expect(bodies[0]).toEqual(bodies[1])
  fireEvent.click(screen.getByRole('button', { name: 'Trocar cliente' })); fireEvent.click(screen.getByRole('button', { name: '+ Cadastrar cliente' })); fireEvent.click(screen.getByRole('button', { name: 'Voltar à busca' }))
  expect(screen.getByLabelText('Produtos já escolhidos')).toHaveValue('Água e suco')
})

it('perda de permissão não expõe resultados antigos nem aplica resposta de criação pendente', async () => {
  let finish: ((response: Response) => void) | undefined; const selected = vi.fn()
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => init?.method === 'POST' ? new Promise<Response>(resolve => { finish = resolve }) : json([]))
  const view = mount(<Host selected={selected} />); fireEvent.click(screen.getByRole('button', { name: '+ Cadastrar cliente' })); fireEvent.change(screen.getByLabelText('Nome do novo cliente'), { target: { value: customer.name } }); fireEvent.change(screen.getByLabelText('Telefone do novo cliente'), { target: { value: customer.phone } }); fireEvent.click(screen.getByRole('button', { name: 'Cadastrar e selecionar' })); await waitFor(() => expect(finish).toBeDefined())
  view.actor({ ...operator, permissions: [] }); finish?.(json(customer)); await waitFor(() => expect(screen.getByText('Seu acesso não permite consultar clientes neste atendimento.')).toBeInTheDocument()); expect(selected).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(1)
})

it('leitura sem escrita pode selecionar, sem oferecer criação ou consultar dados de escola/bar', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json([{ id: customer.id, name: customer.name, phoneHint: '•••• 7777', incomplete: false }]))
  mount(<Host scope="students" />, { ...operator, roles: ['Operations'], permissions: ['students:read'] })
  expect(screen.queryByRole('button', { name: '+ Cadastrar cliente' })).not.toBeInTheDocument(); fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'Pessoa' } }); fireEvent.click(await screen.findByRole('button', { name: /Pessoa Teste/ })); expect(within(screen.getByRole('group', { name: 'Cliente' })).getByText('Pessoa Teste')).toBeInTheDocument(); expect(fetch.mock.calls.every(([url]) => String(url).includes('scope=students'))).toBe(true)
})

it('reabre criação incerta com a mesma operação, contato congelado e seleção recuperada explícita', async () => {
  const bodies: Record<string, unknown>[] = []; const selected = vi.fn()
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return bodies.length === 1 ? json({ message: 'Resposta perdida' }, 503) : json({ id: customer.id, name: customer.name, phoneHint: '•••• 7777', incomplete: false }) })
  const first = mount(<Host selected={selected} />)
  fireEvent.click(screen.getByRole('button', { name: '+ Cadastrar cliente' })); fireEvent.change(screen.getByLabelText('Nome do novo cliente'), { target: { value: customer.name } }); fireEvent.change(screen.getByLabelText('Telefone do novo cliente'), { target: { value: customer.phone } }); fireEvent.click(screen.getByRole('button', { name: 'Cadastrar e selecionar' })); await screen.findByRole('alert')
  first.unmount(); mount(<Host selected={selected} />)
  expect(screen.getByLabelText('Nome do novo cliente')).toBeDisabled(); expect(screen.getByLabelText('Telefone do novo cliente')).toBeDisabled()
  const retry = screen.getByRole('button', { name: 'Conferir criação pendente' }); fireEvent.click(retry); fireEvent.click(retry)
  fireEvent.click(await screen.findByRole('button', { name: 'Selecionar cliente recuperado' }))
  expect(bodies).toHaveLength(2); expect(bodies[1]).toEqual(bodies[0]); expect(selected).toHaveBeenCalledTimes(1); expect(selected).toHaveBeenCalledWith({ id: customer.id, name: customer.name, phoneHint: '•••• 7777', incomplete: false }); expect(localStorage.length).toBe(0)
})

it.each([false, true])('criação incerta preserva a identificação opcional e protege a obrigatória: required=%s', async required => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ message: 'Resposta perdida' }, 503)); const submit = vi.fn()
  mount(<Host required={required} submit={submit} />); fireEvent.click(screen.getByRole('button', { name: '+ Cadastrar cliente' })); fireEvent.change(screen.getByLabelText('Nome do novo cliente'), { target: { value: customer.name } }); fireEvent.change(screen.getByLabelText('Telefone do novo cliente'), { target: { value: customer.phone } }); fireEvent.click(screen.getByRole('button', { name: 'Cadastrar e selecionar' })); await screen.findByRole('alert')
  fireEvent.submit(screen.getByRole('button', { name: 'Salvar atendimento' }).closest('form')!)
  expect(submit).toHaveBeenCalledTimes(required ? 0 : 1); expect(localStorage.length).toBe(1)
})

it('aceita código do país até 15 dígitos e nomes de 240 caracteres sem reduzir o contrato', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ...customer, phone: '5511988887777' }))
  mount(<Host />); fireEvent.click(screen.getByRole('button', { name: '+ Cadastrar cliente' }))
  expect(screen.getByLabelText('Nome do novo cliente')).toHaveAttribute('maxlength', '240')
  fireEvent.change(screen.getByLabelText('Nome do novo cliente'), { target: { value: 'N'.repeat(240) } }); fireEvent.change(screen.getByLabelText('Telefone do novo cliente'), { target: { value: '+55 (11) 98888-7777' } }); fireEvent.click(screen.getByRole('button', { name: 'Cadastrar e selecionar' }))
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce()); expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({ name: 'N'.repeat(240), phone: '5511988887777' })
})
