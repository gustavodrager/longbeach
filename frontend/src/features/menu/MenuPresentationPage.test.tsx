import { act, fireEvent, render, screen } from '@testing-library/react'
import { MenuPresentationPage } from './MenuPresentationPage'
import { cacheMenu, isPublishedMenu, menuCacheKey, paginateMenu, readMenuCache } from './menuPresentationModel'
import type { PublishedMenuDocument } from './menuTypes'

const documentMenu = (version = 1): PublishedMenuDocument => ({
  version, publishedAtUtc: '2026-10-29T12:00:00Z', title: 'Cardápio', pages: [
    { id: 'water', title: 'Sem álcool', durationSeconds: 10, items: [{ id: 'a', name: 'Água', description: '', price: 5 }] },
    { id: 'food', title: 'Petiscos', durationSeconds: 10, items: [{ id: 'b', name: 'Salame', description: '', price: 20 }] },
  ],
})
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
async function settle() { await act(async () => { await Promise.resolve(); await Promise.resolve() }) }
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); Object.defineProperty(window, 'innerHeight', { value: 1024, configurable: true }) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

it('troca a cada dez segundos, repete o ciclo e permite pausar e avançar', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => reply(documentMenu())))
  render(<MenuPresentationPage />); await settle()
  expect(screen.getByRole('heading', { name: 'Sem álcool' })).toBeInTheDocument()
  await act(async () => vi.advanceTimersByTime(10_000))
  expect(screen.getByRole('heading', { name: 'Petiscos' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Pausar' }))
  await act(async () => vi.advanceTimersByTime(20_000))
  expect(screen.getByText('Salame')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
  expect(screen.getByText('Água')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  await act(async () => vi.advanceTimersByTime(10_000))
  expect(screen.getByText('Salame')).toBeInTheDocument()
})

it('aplica uma publicação nova apenas na troca de página e segue tocando', async () => {
  let next = documentMenu()
  const request = vi.fn<typeof fetch>(async () => reply(next))
  vi.stubGlobal('fetch', request)
  render(<MenuPresentationPage />); await settle()
  await act(async () => vi.advanceTimersByTime(10_000))
  await act(async () => vi.advanceTimersByTime(10_000))
  await act(async () => vi.advanceTimersByTime(5_000))
  next = documentMenu(2); next.pages[0].items[0].name = 'Água atualizada'
  fireEvent(window, new Event('online')); await settle()
  expect(screen.queryByText('Água atualizada')).not.toBeInTheDocument()
  await act(async () => vi.advanceTimersByTime(5_000))
  expect(screen.getByText('Água atualizada')).toBeInTheDocument()
  await act(async () => vi.advanceTimersByTime(10_000))
  expect(screen.getByText('Salame')).toBeInTheDocument()
  expect(request.mock.calls.every(call => !('Authorization' in ((call[1] as RequestInit | undefined)?.headers ?? {})))).toBe(true)
})

it('continua com a última publicação sem internet e descarta cache se não há publicação', async () => {
  cacheMenu(documentMenu())
  const request = vi.fn().mockRejectedValue(new TypeError('offline'))
  vi.stubGlobal('fetch', request)
  render(<MenuPresentationPage />); await settle()
  expect(screen.getByText(/exibindo a última versão/)).toBeInTheDocument()
  await act(async () => vi.advanceTimersByTime(10_000))
  expect(screen.getByText('Salame')).toBeInTheDocument()
  request.mockResolvedValue(reply({}, 404)); fireEvent(window, new Event('online')); await settle()
  expect(screen.getByText('O cardápio ainda não foi publicado.')).toBeInTheDocument()
  expect(readMenuCache()).toBeNull()
})

it('atualiza uma apresentação com uma página após vários ciclos', async () => {
  let next = documentMenu(); next.pages = next.pages.slice(0, 1)
  vi.stubGlobal('fetch', vi.fn(async () => reply(next)))
  render(<MenuPresentationPage />); await settle()
  for (let i = 0; i < 3; i++) await act(async () => vi.advanceTimersByTime(10_000))
  next = { ...next, version: 2, pages: [{ ...next.pages[0], items: [{ ...next.pages[0].items[0], name: 'Novo preço publicado' }] }] }
  fireEvent(window, new Event('online')); await settle()
  await act(async () => vi.advanceTimersByTime(10_000))
  expect(screen.getByText('Novo preço publicado')).toBeInTheDocument()
})

it('não aceita dados inválidos ou preços ausentes no cache', () => {
  localStorage.setItem(menuCacheKey, '{invalid'); expect(readMenuCache()).toBeNull()
  expect(isPublishedMenu(documentMenu())).toBe(true)
  const broken = documentMenu(); broken.pages[0].items[0].price = 0
  expect(isPublishedMenu(broken)).toBe(false)
  expect(isPublishedMenu({ ...documentMenu(), pages: [] })).toBe(false)
})

it('divide categorias grandes preservando itens, preços e tempo', () => {
  const page = documentMenu().pages[0]
  page.items = Array.from({ length: 12 }, (_, i) => ({ id: String(i), name: `Produto ${i}`, description: '', price: 8 }))
  const pages = paginateMenu([page], 5)
  expect(pages.map(p => p.items.length)).toEqual([5, 5, 2])
  expect(pages.flatMap(p => p.items)).toEqual(page.items)
  expect(pages.every(p => p.durationSeconds === 10 && p.parts === 3)).toBe(true)
})
