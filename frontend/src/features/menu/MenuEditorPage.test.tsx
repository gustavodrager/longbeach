import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { MenuEditorPage } from './MenuEditorPage'
import { loadMenu, loadMenuCatalog, saveMenu, publishMenu } from './menuApi'
vi.mock('./menuApi', () => ({ loadMenu: vi.fn(), loadMenuCatalog: vi.fn(), saveMenu: vi.fn(), publishMenu: vi.fn() }))
const draft = { title: 'CARDÁPIO', pages: [{ id: 'p', title: 'Bebidas', durationSeconds: 10, visible: true, items: [{ id: 'i', name: 'Água', description: '', visible: true, productIds: ['a'] }] }] }
beforeEach(() => {
  vi.mocked(loadMenu).mockResolvedValue({ version: 1, draft, published: null })
  vi.mocked(loadMenuCatalog).mockResolvedValue([{ id: 'a', name: 'Água', salePrice: 5, active: true }])
})
it('exige salvar alterações antes de publicar e mantém chamadas separadas', async () => {
  vi.mocked(saveMenu).mockImplementation(async (version, next) => ({ version: version + 1, draft: next, published: null }))
  vi.mocked(publishMenu).mockResolvedValue({ version: 3, draft, published: null })
  render(<MemoryRouter><MenuEditorPage /></MemoryRouter>)
  await screen.findByText('Versão de edição: 1 · Ainda sem publicação')
  fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Novo título' } })
  expect(screen.getByText('Publicar versão salva')).toBeDisabled()
  fireEvent.click(screen.getByText('Salvar rascunho'))
  await screen.findByText('Rascunho salvo. A publicação permanece estável.')
  expect(saveMenu).toHaveBeenCalledWith(1, expect.objectContaining({ title: 'Novo título' }))
  expect(publishMenu).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Publicar versão salva'))
  await waitFor(() => expect(publishMenu).toHaveBeenCalledWith(2))
})
it('bloqueia publicação e mostra produtos com preço pendente', async () => {
  vi.mocked(loadMenuCatalog).mockResolvedValue([{ id: 'a', name: 'Água', salePrice: 0, active: true }])
  render(<MemoryRouter><MenuEditorPage /></MemoryRouter>)
  await screen.findByText(/Há produto sem preço de venda válido/)
  expect(screen.getByText('Publicar versão salva')).toBeDisabled()
})
