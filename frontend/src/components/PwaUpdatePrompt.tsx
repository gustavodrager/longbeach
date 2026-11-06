import { useRegisterSW } from 'virtual:pwa-register/react'
import { useCallback, useRef } from 'react'
import { reloadAfterSessionRequests, reloadPage } from '../lib/sessionReload'

export function PwaUpdatePrompt() {
  const reloadPending = useRef(false)
  const needsPageReload = useRef(false)
  const requestPageReload = useCallback(() => {
    if (reloadPending.current) return
    reloadPending.current = true
    void reloadAfterSessionRequests()
      .catch(() => {
        // A browser can expose Web Locks but refuse acquisition.
        try { reloadPage() } catch { /* Navigation can be blocked by the browser. */ }
      })
      .finally(() => { reloadPending.current = false })
  }, [])
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onNeedReload: () => {
      needsPageReload.current = true
      requestPageReload()
    },
  })

  if (!needRefresh && !offlineReady) return null

  return (
    <aside className="pwa-notice" role="status" aria-live="polite">
      <div>
        <strong>{needRefresh ? 'Atualização disponível' : 'Aplicativo pronto'}</strong>
        <span>{needRefresh ? 'Atualize quando terminar o que está fazendo.' : 'O sistema pode ser aberto novamente mesmo sem conexão.'}</span>
      </div>
      {needRefresh && (
        <button type="button" onClick={() => {
          if (needsPageReload.current) requestPageReload()
          else void updateServiceWorker(true)
        }}>
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
