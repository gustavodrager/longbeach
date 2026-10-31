import { act, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom'
import { SectionNavigation } from './SectionNavigation'

const items = Array.from({ length: 6 }, (_, index) => ({ href: `/secao/${index}`, label: `Seção ${index}` }))
function Page() {
  const location = useLocation()
  return <SectionNavigation items={items} activeHref={location.pathname} label="Seções" className="module-navigation" />
}
it('mantém a seção atual visível ao abrir e trocar páginas sem rolar a página na vertical', async () => {
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  let availableWidth = 320
  let resize: () => void = () => {}
  const disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback }
    observe() {}
    disconnect = disconnect
  })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const index = items.findIndex(item => item.href === this.getAttribute('href'))
    const left = index < 0 ? 0 : index * 180 - (this.parentElement?.scrollLeft ?? 0)
    const width = index < 0 ? availableWidth : 180
    return { left, right: left + width, width, top: 200, bottom: 248, height: 48, x: left, y: 200, toJSON: () => ({}) }
  })
  const router = createMemoryRouter([{ path: '*', element: <Page /> }], { initialEntries: ['/secao/5'] })
  render(<RouterProvider router={router} />)
  const navigation = screen.getByRole('navigation', { name: 'Seções' })
  expect(navigation.scrollLeft).toBe(768)
  expect(screen.getByRole('link', { name: 'Seção 5' })).toHaveAttribute('aria-current', 'page')
  availableWidth = 280
  act(() => resize())
  expect(navigation.scrollLeft).toBe(808)
  await act(() => router.navigate('/secao/0'))
  expect(navigation.scrollLeft).toBe(0)
  expect(screen.getAllByRole('link')).toHaveLength(6)
  expect(scroll).not.toHaveBeenCalled()
  router.dispose()
  expect(disconnect).toHaveBeenCalled()
  vi.unstubAllGlobals()
})
