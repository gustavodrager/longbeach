import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { UnsavedChangesProvider } from '../../components/managementUi'
import { InventoryDetailsPage } from '../../pages/OperationsPages'
import { AuthContext } from '../auth/authContext'
import type { AuthUser } from '../auth/types'
import { DemoDataProvider, type InventoryItem } from './DemoDataProvider'

it('keeps one material movement dialog and its draft through dirty-state changes and background refreshes', async () => {
  vi.stubEnv('VITE_OPERATIONAL_STORAGE', 'postgres')
  vi.stubEnv('VITE_API_URL', '')
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  const material: InventoryItem = {
    id: '00000000-0000-4000-8000-000000000001', version: 3, name: 'Material sintético',
    category: 'Limpeza', unit: 'litro', quantity: 2.125, minimum: 1, unitCost: 17,
    location: 'Depósito sintético', notes: '', paymentMethod: 'Pix', movements: [], nature: 'Consumable',
  }
  const owner: AuthUser = {
    id: 'synthetic-owner', name: 'Operador sintético', email: 'operator@example.invalid',
    roles: ['Manager'], permissions: [],
  }
  let inventoryReads = 0
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    expect(!init?.method || init.method === 'GET').toBe(true)
    const url = String(input)
    if (url.endsWith('/inventory')) inventoryReads += 1
    const value = url.endsWith('/inventory') ? [{ ...material }]
      : url.includes('/movements') ? { items: [], page: 1, total: 0 } : []
    return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
  })

  // Production mounts both siblings inside the data router and dirty-state
  // provider. A plain MemoryRouter does not exercise the global dirty update.
  function Root() {
    return <UnsavedChangesProvider><AuthContext.Provider value={{
      user: owner, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {},
      signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {},
    }}><DemoDataProvider enabled demoMode={false}><Outlet /></DemoDataProvider></AuthContext.Provider></UnsavedChangesProvider>
  }
  const router = createMemoryRouter([{ element: <Root />, children: [{
    path: '/administracao/materiais/:itemId', element: <InventoryDetailsPage />,
  }] }], { initialEntries: ['/administracao/materiais/' + material.id] })
  const view = render(<RouterProvider router={router} />)
  const user = userEvent.setup()
  const quantity = () => screen.getByLabelText('Quantidade (litro)')
  const reason = () => screen.getByLabelText('Motivo ou documento de referência')
  const destination = () => screen.getByLabelText('Área ou responsável pelo destino')

  try {
    await screen.findByRole('heading', { name: 'Movimentações confirmadas' })
    await user.click(await screen.findByRole('button', { name: 'Movimentar' }))
    const dialog = screen.getByRole('dialog', { name: 'Movimentar Material sintético' })
    expect(document.querySelectorAll('dialog')).toHaveLength(1)

    await user.type(quantity(), '1')
    expect(document.querySelectorAll('dialog')).toHaveLength(1)
    expect(quantity()).toHaveValue('1')
    await user.type(quantity(), ',125')
    await user.type(reason(), 'Conferência sintética sem envio')
    await user.type(destination(), 'Área esportiva sintética')
    await user.selectOptions(screen.getByLabelText('Tipo de movimentação'), 'Loss')

    function expectDraft() {
      expect(document.querySelectorAll('dialog')).toHaveLength(1)
      expect(screen.getByRole('dialog', { name: 'Movimentar Material sintético' })).toBe(dialog)
      expect(quantity()).toHaveValue('1,125')
      expect(reason()).toHaveValue('Conferência sintética sem envio')
      expect(destination()).toHaveValue('Área esportiva sintética')
      expect(screen.getByLabelText('Tipo de movimentação')).toHaveValue('Loss')
      expect(screen.getByRole('button', { name: 'Confirmar movimentação' })).toBeEnabled()
      expect(screen.getByRole('heading', { name: 'Movimentações confirmadas' })).toBeInTheDocument()
    }
    expectDraft()
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const before = inventoryReads
      await act(async () => { window.dispatchEvent(new Event('focus')) })
      await waitFor(() => expect(inventoryReads).toBeGreaterThan(before))
      expectDraft()
    }

    await user.click(screen.getByRole('button', { name: 'Fechar Movimentar Material sintético' }))
    expect(confirm).toHaveBeenCalledWith('Descartar as alterações não salvas?')
    expect(document.querySelectorAll('dialog')).toHaveLength(0)
    expect(screen.getByRole('heading', { name: 'Movimentações confirmadas' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Movimentar' }))
    expect(document.querySelectorAll('dialog')).toHaveLength(1)
    expect(quantity()).toHaveValue('')
    expect(reason()).toHaveValue('')
    expect(destination()).toHaveValue('')
    expect(screen.getByLabelText('Tipo de movimentação')).toHaveValue('Receipt')
    await user.click(screen.getByRole('button', { name: 'Fechar Movimentar Material sintético' }))
    expect(document.querySelectorAll('dialog')).toHaveLength(0)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true)
  } finally {
    view.unmount()
    router.dispose()
    vi.unstubAllEnvs()
  }
})
