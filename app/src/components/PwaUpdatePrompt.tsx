import { useRegisterSW } from 'virtual:pwa-register/react'

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh && !offlineReady) return null

  return (
    <aside className="pwa-notice" role="status" aria-live="polite">
      <div>
        <strong>{needRefresh ? 'Atualização disponível' : 'Aplicativo pronto'}</strong>
        <span>{needRefresh ? 'Atualize quando terminar o que está fazendo.' : 'O sistema pode ser aberto novamente mesmo sem conexão.'}</span>
      </div>
      {needRefresh && (
        <button type="button" onClick={() => void updateServiceWorker(true)}>
          Atualizar agora
        </button>
      )}
      <button
        className="pwa-dismiss"
        type="button"
        aria-label="Fechar aviso"
        onClick={() => {
          setNeedRefresh(false)
          setOfflineReady(false)
        }}
      >
        ×
      </button>
    </aside>
  )
}
