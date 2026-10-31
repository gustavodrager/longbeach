import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  expect(within(await screen.findByRole('region', { name: 'Pendências de publicação' })).getByText(/Há produto sem preço de venda válido/)).toBeVisible()
  expect(screen.getByText('Publicar versão salva')).toBeDisabled()
})

it('mantém pendências de páginas recolhidas visíveis antes da publicação', async () => {
  vi.mocked(loadMenu).mockResolvedValue({ version: 1, published: null, draft: { ...draft, pages: [...draft.pages, { ...draft.pages[0], id: 'second', title: 'Lanches', items: [{ ...draft.pages[0].items[0], id: 'second-item', name: 'Suco', productIds: ['b'] }] }] } })
  vi.mocked(loadMenuCatalog).mockResolvedValue([{ id: 'a', name: 'Água', salePrice: 5, active: true }, { id: 'b', name: 'Suco', salePrice: 0, active: true }])
  render(<MemoryRouter><MenuEditorPage /></MemoryRouter>)
  expect(within(await screen.findByRole('region', { name: 'Pendências de publicação' })).getByText(/Há produto sem preço de venda válido/)).toBeVisible()
  const page = screen.getByText('Lanches', { selector: 'summary strong' }).closest('details')!
  expect(page).not.toHaveAttribute('open')
  expect(within(page.querySelector('summary')!).getByText(/Há produto sem preço de venda válido/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Publicar versão salva' })).toBeDisabled()
  expect(screen.getByRole('region', { name: 'Pendências de publicação' })).toBeVisible()
})

it('abre a página e o item recolhidos para focar um campo inválido', async () => {
  render(<MemoryRouter><MenuEditorPage /></MemoryRouter>)
  const page = (await screen.findByText('Bebidas', { selector: 'summary strong' })).closest('details')!
  const item = within(page).getByText('Água', { selector: 'summary strong' }).closest('details')!
  page.open = false
  item.open = false
  const input = within(item).getByLabelText('Nome')
  fireEvent.invalid(input)
  await waitFor(() => expect(input).toHaveFocus())
  expect(page).toHaveAttribute('open')
  expect(item).toHaveAttribute('open')
})
