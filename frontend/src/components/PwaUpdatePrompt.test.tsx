import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PwaUpdatePrompt } from './PwaUpdatePrompt'

const state = vi.hoisted(() => ({
  needRefresh: true,
  offlineReady: false,
  options: null as { onNeedReload?: () => void } | null,
  setNeedRefresh: vi.fn(), setOfflineReady: vi.fn(), updateServiceWorker: vi.fn(),
  reloadAfterSessionRequests: vi.fn<() => Promise<void>>(), reloadPage: vi.fn(),
}))
vi.mock('virtual:pwa-register/react', () => ({ useRegisterSW: (options: { onNeedReload?: () => void }) => {
  state.options = options
  return { needRefresh: [state.needRefresh, state.setNeedRefresh], offlineReady: [state.offlineReady, state.setOfflineReady], updateServiceWorker: state.updateServiceWorker }
} }))
vi.mock('../lib/sessionReload', () => ({ reloadAfterSessionRequests: state.reloadAfterSessionRequests, reloadPage: state.reloadPage }))

beforeEach(() => {
  state.needRefresh = true; state.offlineReady = false; state.options = null
  state.setNeedRefresh.mockReset(); state.setOfflineReady.mockReset(); state.updateServiceWorker.mockReset()
  state.reloadAfterSessionRequests.mockReset().mockResolvedValue(undefined); state.reloadPage.mockReset()
})
afterEach(() => { cleanup() })

it('mantém o aviso e a ação de ativar a atualização sem recarregar antes do controlling', () => {
  render(<PwaUpdatePrompt />)
  expect(screen.getByRole('status')).toHaveTextContent('Atualização disponível')
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar agora' }))
  expect(state.updateServiceWorker).toHaveBeenCalledExactlyOnceWith(true)
  expect(state.reloadAfterSessionRequests).not.toHaveBeenCalled()
})

it('encaminha onNeedReload para a recarga coordenada com a sessão', async () => {
  render(<PwaUpdatePrompt />)
  await act(async () => { state.options?.onNeedReload?.() })
  expect(state.reloadAfterSessionRequests).toHaveBeenCalledTimes(1)
  expect(state.reloadPage).not.toHaveBeenCalled()
})

it('não duplica a recarga enquanto a primeira espera pela sessão', async () => {
  let finish!: () => void
  state.reloadAfterSessionRequests.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve }))
  render(<PwaUpdatePrompt />)
  await act(async () => {
    state.options?.onNeedReload?.(); state.options?.onNeedReload?.()
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar agora' }))
  })
  expect(state.reloadAfterSessionRequests).toHaveBeenCalledTimes(1)
  expect(state.updateServiceWorker).not.toHaveBeenCalled()
  await act(async () => { finish() })
  expect(state.reloadPage).not.toHaveBeenCalled()
})

it('usa recarga normal uma vez quando o navegador recusa adquirir o lock', async () => {
  state.reloadAfterSessionRequests.mockRejectedValueOnce(new Error('Locks unavailable'))
  render(<PwaUpdatePrompt />)
  await act(async () => { state.options?.onNeedReload?.() })
  expect(state.reloadPage).toHaveBeenCalledTimes(1)
})

it('permite tentar a navegação novamente quando o worker já ativou e a primeira recarga foi cancelada', async () => {
  render(<PwaUpdatePrompt />)
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar agora' }))
  expect(state.updateServiceWorker).toHaveBeenCalledExactlyOnceWith(true)
  await act(async () => { state.options?.onNeedReload?.() })
  expect(state.reloadAfterSessionRequests).toHaveBeenCalledTimes(1)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Atualizar agora' })) })
  expect(state.reloadAfterSessionRequests).toHaveBeenCalledTimes(2)
  expect(state.updateServiceWorker).toHaveBeenCalledTimes(1)
  expect(state.reloadPage).not.toHaveBeenCalled()
})

it('mantém fechar aviso e a mensagem de aplicativo pronto', () => {
  state.needRefresh = false; state.offlineReady = true
  render(<PwaUpdatePrompt />)
  expect(screen.getByRole('status')).toHaveTextContent('Aplicativo pronto')
  expect(screen.queryByRole('button', { name: 'Atualizar agora' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }))
  expect(state.setNeedRefresh).toHaveBeenCalledWith(false)
  expect(state.setOfflineReady).toHaveBeenCalledWith(false)
})
