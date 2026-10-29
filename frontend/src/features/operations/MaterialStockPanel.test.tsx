import type { MockInstance } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '../auth/authContext'
import type { AuthUser } from '../auth/types'
import { InventoryDetailsPage, InventoryPage } from '../../pages/OperationsPages'
import { DemoDataProvider, useOperations, type InventoryItem } from './DemoDataProvider'
import { MaterialStockPanel } from './MaterialStockPanel'
import { useState } from 'react'
import type { MaterialMovementInput, MaterialMovementRow } from './materialStock'

const owner: AuthUser = { id: 'operator-one', name: 'Operador de teste', email: 'operator@example.test', roles: ['Manager'], permissions: [] }
const material: InventoryItem = { id: '00000000-0000-4000-8000-000000000001', version: 3, name: 'Material de teste', category: 'Limpeza', unit: 'litro', quantity: 2.125, minimum: 1, unitCost: 17, location: 'Depósito', notes: '', paymentMethod: 'Pix', movements: [], nature: 'Consumable' }
const movement: MaterialMovementRow = { id: 'movement-test', materialId: material.id, kind: 'Consumption', before: 2.125, quantity: -0.125, after: 2, unit: 'litro', location: 'Depósito', reason: 'Limpeza das quadras', destination: 'Área esportiva', actorId: owner.id, actorName: 'Operador de teste', occurredAt: '2026-10-27T15:00:00Z' }
function response(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }) }
function api(getMaterial: () => InventoryItem = () => material) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = String(input)
    return response(url.includes('/movements') ? { items: [], page: 1, total: 0 } : url.endsWith('/inventory') ? [getMaterial()] : [])
  })
}
function Status() { const data = useOperations(); return <p data-testid="connection">{data.persistenceStatus}</p> }
function tree({ identity = owner as AuthUser | null, details = false, demo = false, harness = false } = {}) {
  return <AuthContext.Provider value={{ user: identity, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {} }}>
    <DemoDataProvider enabled demoMode={demo}><MemoryRouter initialEntries={[details ? `/materials/${material.id}` : '/materials']}><Status />{harness ? <UnmountHarness /> : <Routes><Route path="/materials" element={<InventoryPage />} /><Route path="/materials/:itemId" element={<InventoryDetailsPage />} /></Routes>}</MemoryRouter></DemoDataProvider>
  </AuthContext.Provider>
}
function UnmountHarness() {
  const data = useOperations(), [open, setOpen] = useState(false)
  return <><button onClick={() => setOpen(true)}>Abrir controle</button><button onClick={() => setOpen(false)}>Simular outra tela</button><p data-testid="balance">{data.inventory[0]?.quantity}</p>{open && data.inventory[0] && <MaterialStockPanel item={data.inventory[0]} onClose={() => setOpen(false)} />}</>
}
async function open() { await userEvent.click(await screen.findByRole('button', { name: 'Movimentar' })); return screen.getByRole('dialog') }
async function fill(amount = '0,125') {
  await userEvent.type(screen.getByLabelText('Quantidade (litro)'), amount)
  await userEvent.type(screen.getByLabelText('Motivo ou documento de referência'), 'Limpeza das quadras')
  await userEvent.type(screen.getByLabelText('Área ou responsável pelo destino'), 'Área esportiva')
}
const postBodies = (fetch: MockInstance<typeof globalThis.fetch>) => fetch.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST').map(([, init]) => JSON.parse(String((init as RequestInit).body)) as MaterialMovementInput)
beforeEach(() => { localStorage.clear(); vi.stubEnv('VITE_OPERATIONAL_STORAGE', 'local'); vi.stubEnv('VITE_API_URL', ''); vi.spyOn(window, 'confirm').mockReturnValue(true) })
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

it('keeps the exact uncertain operation after close, remount and a newer background balance', async () => {
  let current = material
  const fetch = api(() => current)
  fetch.mockImplementation(async (input, init) => {
    if (init?.method === 'POST') {
      if (postBodies(fetch).length === 1) return response({ message: 'Resposta indisponível' }, 503)
      return response({ material: { ...current, quantity: 7, version: 6 }, movement })
    }
    return response(String(input).endsWith('/inventory') ? [current] : [])
  })
  render(tree()); await open(); await fill(); await userEvent.click(screen.getByRole('button', { name: 'Confirmar movimentação' }))
  await screen.findByText('Resposta indisponível')
  expect(screen.getByLabelText('Quantidade (litro)')).toBeDisabled()
  current = { ...material, quantity: 7, version: 5 }
  await act(async () => { window.dispatchEvent(new Event('focus')) })
  await waitFor(() => expect(document.querySelector('.stock-number')).toHaveTextContent('7 litro'))
  await userEvent.click(screen.getByRole('button', { name: 'Fechar Movimentar Material de teste' }))
  await userEvent.click(screen.getByRole('button', { name: 'Conferir movimentação' }))
  expect(screen.getByText(/Saldo conferido:/)).toHaveTextContent('2,125 litro')
  await userEvent.click(screen.getByRole('button', { name: 'Conferir mesma solicitação' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  const bodies = postBodies(fetch)
  expect(bodies).toHaveLength(2); expect(bodies[1]).toEqual(bodies[0]); expect(bodies[1].expectedVersion).toBe(3)
  expect(document.querySelector('.stock-number')).toHaveTextContent('7 litro')
})

it('keeps a 409 open when refresh fails and uses a new operation only after a successful real refresh', async () => {
  let reads = 0
  const fetch = api()
  fetch.mockImplementation(async (input, init) => {
    if (init?.method === 'POST') return postBodies(fetch).length === 1 ? response({ message: 'Outro operador alterou o saldo' }, 409) : response({ material: { ...material, quantity: 5.125, version: 5 }, movement })
    if (String(input).endsWith('/inventory')) {
      reads += 1
      return reads === 2 ? response({ message: 'Leitura indisponível' }, 503) : response([{ ...material, ...(reads > 2 ? { quantity: 5, version: 4 } : {}) }])
    }
    return response([])
  })
  render(tree()); await open(); await fill(); await userEvent.click(screen.getByRole('button', { name: 'Confirmar movimentação' }))
  await screen.findByText('Outro operador alterou o saldo')
  await userEvent.click(screen.getByRole('button', { name: 'Atualizar saldo e refazer' }))
  await screen.findByText('Leitura indisponível')
  expect(screen.getByRole('dialog')).toBeInTheDocument(); expect(postBodies(fetch)).toHaveLength(1)
  await userEvent.click(screen.getByRole('button', { name: 'Atualizar saldo e refazer' }))
  await waitFor(() => expect(screen.getByLabelText('Quantidade (litro)')).toHaveValue(''))
  expect(screen.getByText(/Saldo conferido:/)).toHaveTextContent('5 litro')
  expect(screen.getByRole('button', { name: 'Confirmar movimentação' })).toBeDisabled()
  await userEvent.type(screen.getByLabelText('Quantidade (litro)'), '.125')
  expect(screen.getByRole('button', { name: 'Confirmar movimentação' })).toBeDisabled()
  await userEvent.clear(screen.getByLabelText('Quantidade (litro)')); await userEvent.type(screen.getByLabelText('Quantidade (litro)'), '0.125')
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar movimentação' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  const bodies = postBodies(fetch); expect(bodies[1].expectedVersion).toBe(4); expect(bodies[1].operationId).not.toBe(bodies[0].operationId)
})

it('validates fractions, negative balances, count zero and required evidence before writing', async () => {
  const fetch = api()
  render(tree()); await open(); await fill('0.0001')
  const submit = screen.getByRole('button', { name: 'Confirmar movimentação' })
  expect(submit).toBeDisabled()
  await userEvent.clear(screen.getByLabelText('Quantidade (litro)')); await userEvent.type(screen.getByLabelText('Quantidade (litro)'), '0')
  expect(submit).toBeDisabled()
  await userEvent.selectOptions(screen.getByLabelText('Tipo de movimentação'), 'Consumption')
  await userEvent.clear(screen.getByLabelText('Quantidade (litro)')); await userEvent.type(screen.getByLabelText('Quantidade (litro)'), '3')
  expect(submit).toBeDisabled()
  await userEvent.selectOptions(screen.getByLabelText('Tipo de movimentação'), 'Count')
  await userEvent.clear(screen.getByLabelText('Quantidade contada (litro)')); await userEvent.type(screen.getByLabelText('Quantidade contada (litro)'), '0')
  expect(submit).toBeEnabled(); expect(postBodies(fetch)).toHaveLength(0)
  await userEvent.clear(screen.getByLabelText('Área ou responsável pelo destino'))
  expect(submit).toBeDisabled()
})

it('supports legacy materials without version and leaves stock changes outside the metadata editor', async () => {
  const fetch = api(() => ({ ...material, version: undefined, nature: undefined }))
  fetch.mockImplementation(async (input, init) => init?.method === 'POST' ? response({ material: { ...material, quantity: 2.25, version: 1 }, movement }) : response(String(input).endsWith('/inventory') ? [{ ...material, version: undefined, nature: undefined }] : []))
  render(tree()); await open()
  expect(screen.queryByRole('option', { name: 'Consumo' })).not.toBeInTheDocument()
  await fill(); await userEvent.click(screen.getByRole('button', { name: 'Confirmar movimentação' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(postBodies(fetch)[0].expectedVersion).toBe(0)
  await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
  expect(screen.queryByLabelText('Quantidade atual')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Unidade')).toBeDisabled()
  expect(screen.getByText(/Saldo atual:/)).toHaveTextContent('2,25 litro')
})

it('omits protected costs and count permission for inventory operators', async () => {
  const identity: AuthUser = { ...owner, roles: ['Operations'], permissions: ['inventory:read', 'inventory:write'] }
  const redacted = { ...material, costsVisible: false, unitCost: 0, paymentMethod: '' }
  const fetch = api(() => redacted)
  fetch.mockImplementation(async (input, init) => init?.method === 'PUT' ? response({ ...redacted, ...JSON.parse(String(init.body)) }) : response(String(input).endsWith('/inventory') ? [redacted] : []))
  render(tree({ identity })); await open()
  expect(screen.queryByRole('option', { name: 'Contagem física' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Fechar Movimentar Material de teste' }))
  await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
  expect(screen.queryByLabelText('Custo unitário estimado (R$)')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Meio usual de compra')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Salvar cadastro' }))
  await waitFor(() => expect(fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true))
  const sent = JSON.parse(String(fetch.mock.calls.find(([, init]) => init?.method === 'PUT')?.[1]?.body))
  expect(sent).not.toHaveProperty('unitCost'); expect(sent).not.toHaveProperty('paymentMethod'); expect(sent.quantity).toBe(2.125)
})

it('shows the ledger to read-only operators, with attribution and pagination, while hiding writes and redacted costs', async () => {
  const fetch = api()
  fetch.mockImplementation(async input => String(input).includes('/movements') ? response({ items: [movement], page: String(input).includes('page=2') ? 2 : 1, total: 51 }) : response(String(input).endsWith('/inventory') ? [{ ...material, costsVisible: false, unitCost: 0 }] : []))
  render(tree({ details: true, identity: { ...owner, roles: ['Operations'], permissions: ['inventory:read', 'finance:read'] } }))
  await screen.findByText('Limpeza das quadras · Destino: Área esportiva')
  expect(screen.getByText('Consumo · -0,125 litro')).toBeInTheDocument()
  expect(screen.getByText(/Operador de teste/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Movimentar' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Editar dados' })).not.toBeInTheDocument()
  expect(screen.getAllByText('Acesso restrito')).toHaveLength(2)
  await userEvent.click(screen.getByRole('button', { name: 'Próxima' }))
  await waitFor(() => expect(fetch.mock.calls.some(([input]) => String(input).endsWith('/movements?page=2'))).toBe(true))
})

it('does not offer consumption of durable equipment', async () => {
  api(() => ({ ...material, nature: 'Reusable' })); render(tree()); await open()
  expect(screen.queryByRole('option', { name: 'Consumo' })).not.toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'Perda' })).toBeInTheDocument()
})

it('disables material movements in the unauthenticated remote demonstration', async () => {
  vi.stubEnv('VITE_OPERATIONAL_STORAGE', 'postgres'); vi.stubEnv('VITE_API_URL', 'https://example.test')
  const fetch = api(); render(tree({ identity: null, demo: true, details: true }))
  await screen.findByText(/Movimentações exigem uma sessão individual/)
  expect(screen.queryByRole('button', { name: 'Movimentar' })).not.toBeInTheDocument()
  expect(fetch.mock.calls.some(([input]) => String(input).includes('/materials/'))).toBe(false)
})

it('never uses browser demo stock or receipts as a production fallback', async () => {
  localStorage.setItem('longbeach-os-demo-v1', JSON.stringify({ inventory: [{ ...material, name: 'Falso saldo local' }], __materialOperations: { fake: { movement } } }))
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response({ message: 'API indisponível' }, 503))
  render(tree()); await screen.findByText('API indisponível')
  expect(screen.queryByText('Falso saldo local')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Movimentar' })).not.toBeInTheDocument()
  expect(fetch.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true)
  expect(localStorage.getItem('longbeach-os-demo-v1')).toContain('Falso saldo local')
})

it('remembers a confirmation received while the panel was unmounted and never resubmits it', async () => {
  let finish: ((value: Response) => void) | undefined
  const fetch = api()
  fetch.mockImplementation(async (input, init) => init?.method === 'POST' ? new Promise<Response>(resolve => { finish = resolve }) : response(String(input).endsWith('/inventory') ? [material] : []))
  render(tree({ harness: true })); await screen.findByText('connected'); await userEvent.click(screen.getByRole('button', { name: 'Abrir controle' }))
  await fill(); await userEvent.click(screen.getByRole('button', { name: 'Confirmar movimentação' }))
  await userEvent.click(screen.getByRole('button', { name: 'Simular outra tela' }))
  await act(async () => { finish?.(response({ material: { ...material, quantity: 2.25, version: 4 }, movement })) })
  await userEvent.click(screen.getByRole('button', { name: 'Abrir controle' }))
  expect(screen.getByText(/Esta movimentação já foi confirmada/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Confirmar movimentação' })).not.toBeInTheDocument()
  expect(postBodies(fetch)).toHaveLength(1)
})

it('discards late movement responses and private forms after the session changes', async () => {
  let finish: ((value: Response) => void) | undefined
  const fetch = api()
  fetch.mockImplementation(async (input, init) => init?.method === 'POST' ? new Promise<Response>(resolve => { finish = resolve }) : response(String(input).endsWith('/inventory') ? [material] : []))
  const view = render(tree()); await open(); await fill(); await userEvent.click(screen.getByRole('button', { name: 'Confirmar movimentação' }))
  view.rerender(tree({ identity: { ...owner, id: 'operator-two', roles: ['Operations'], permissions: ['inventory:read'] } }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await act(async () => { finish?.(response({ material: { ...material, name: 'Resposta antiga privada', quantity: 9, version: 4 }, movement })) })
  expect(screen.queryByText('Resposta antiga privada')).not.toBeInTheDocument()
  expect(document.querySelector('.stock-number')).toHaveTextContent('2,125 litro')
})

it('keeps incomplete legacy metadata safe and asks for a storage location instead of crashing', async () => {
  api(() => ({ ...material, version: undefined, location: undefined, unit: undefined } as unknown as InventoryItem))
  render(tree()); await open()
  expect(screen.getByText('Informe onde o material fica guardado antes de movimentar.')).toBeInTheDocument()
  expect(screen.getByText(/Este cadastro antigo não informa a unidade/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Confirmar movimentação' })).toBeDisabled()
})

it('clears the previous metadata form before another writer opens the same material', async () => {
  let current = material
  const fetch = api(() => current)
  fetch.mockImplementation(async (input, init) => init?.method === 'PUT' ? response(JSON.parse(String(init.body))) : response(String(input).endsWith('/inventory') ? [current] : []))
  const view = render(tree()); await screen.findByRole('heading', { name: 'Material de teste' })
  await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
  expect(screen.getByLabelText('Custo unitário estimado (R$)')).toHaveValue(17)
  current = { ...material, name: 'Cadastro da sessão atual', costsVisible: false, unitCost: 0, paymentMethod: '' }
  view.rerender(tree({ identity: { ...owner, id: 'operator-two', roles: ['Operations'], permissions: ['inventory:read', 'inventory:write'] } }))
  await waitFor(() => expect(screen.getByLabelText('Material ou equipamento')).toHaveValue('Cadastro da sessão atual'))
  const editor = within(await screen.findByRole('dialog', { name: 'Material' }))
  expect(editor.getByLabelText('Material ou equipamento')).toHaveValue('Cadastro da sessão atual')
  expect(editor.queryByLabelText('Custo unitário estimado (R$)')).not.toBeInTheDocument()
  await userEvent.click(editor.getByRole('button', { name: 'Salvar cadastro' }))
  await waitFor(() => expect(fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true))
  const sent = JSON.parse(String(fetch.mock.calls.find(([, init]) => init?.method === 'PUT')?.[1]?.body))
  expect(sent.name).toBe('Cadastro da sessão atual'); expect(sent).not.toHaveProperty('unitCost')
})

it.each([
  { unit: undefined, movements: undefined },
  { unit: '', movements: [] },
])('requires an explicit unit for a zero-balance legacy material with no history ($unit)', async legacy => {
  let current = { ...material, ...legacy, quantity: 0, version: undefined } as unknown as InventoryItem
  const fetch = api(() => current)
  fetch.mockImplementation(async (input, init) => {
    if (init?.method === 'PUT') { current = { ...JSON.parse(String(init.body)), version: 1 }; return response(current) }
    return response(String(input).endsWith('/inventory') ? [current] : [])
  })
  render(tree()); await screen.findByRole('heading', { name: 'Material de teste' }); await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
  expect(screen.getByLabelText('Unidade')).toBeEnabled()
  expect(screen.getByLabelText('Unidade')).toHaveValue('')
  expect(screen.getByLabelText('Unidade')).toBeRequired()
  expect(screen.getByText(/Selecione explicitamente a unidade/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Salvar cadastro' }))
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  await userEvent.selectOptions(screen.getByLabelText('Unidade'), 'litro')
  expect(screen.getByLabelText('Unidade')).toBeEnabled()
  await userEvent.click(screen.getByRole('button', { name: 'Salvar cadastro' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  const sent = JSON.parse(String(fetch.mock.calls.find(([, init]) => init?.method === 'PUT')?.[1]?.body))
  expect(sent.unit).toBe('litro'); expect(sent.quantity).toBe(0)
  expect(sent.movements).toEqual(legacy.movements)
  await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
  expect(screen.getByLabelText('Unidade')).toHaveValue('litro')
  expect(screen.getByLabelText('Unidade')).toBeDisabled()
})

it.each([
  { quantity: 1, movements: [] },
  { quantity: 0, movements: [{ id: 'previous-movement', kind: 'Entrada', quantity: 1, occurredAt: '2026-10-01T12:00:00Z' }] },
])('requires reconciliation instead of assigning a unit to legacy stock with balance or history ($quantity)', async legacy => {
  const fetch = api(() => ({ ...material, ...legacy, unit: undefined } as unknown as InventoryItem))
  render(tree()); await screen.findByRole('heading', { name: 'Material de teste' }); await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
  expect(screen.getByLabelText('Unidade')).toHaveValue('')
  expect(screen.getByLabelText('Unidade')).toBeDisabled()
  expect(screen.getByText(/É necessária uma reconciliação explícita com a gestão/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Salvar cadastro' })).toBeDisabled()
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
})

it('uses the same explicit one-time unit completion rule in the isolated local demonstration', async () => {
  localStorage.setItem('longbeach-os-demo-v1', JSON.stringify({ inventory: [{ ...material, unit: undefined, quantity: 0, movements: [], version: undefined }] }))
  const fetch = vi.spyOn(globalThis, 'fetch')
  render(tree({ demo: true, identity: null })); await userEvent.click(await screen.findByRole('button', { name: 'Editar' }))
  expect(screen.getByLabelText('Unidade')).toHaveValue('')
  await userEvent.selectOptions(screen.getByLabelText('Unidade'), 'kg')
  await userEvent.click(screen.getByRole('button', { name: 'Salvar cadastro' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  const stored = JSON.parse(localStorage.getItem('longbeach-os-demo-v1') ?? '{}')
  expect(stored.inventory[0]).toMatchObject({ unit: 'kg', quantity: 0, movements: [], version: 1 })
  await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
  expect(screen.getByLabelText('Unidade')).toBeDisabled()
  expect(fetch).not.toHaveBeenCalled()
})
