import { useCallback, useEffect, useRef, useState } from 'react'
import type { PublishedMenuDocument } from './menuTypes'
import { cacheMenu, isPublishedMenu, paginateMenu, readMenuCache } from './menuPresentationModel'
import { MenuSlide } from './MenuSlide'

type WakeLockHandle = { release: () => Promise<void>; released: boolean }
const apiRoot = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
export function MenuPresentationPage() {
  const [menu, setMenu] = useState<PublishedMenuDocument | null>(readMenuCache)
  const [loading, setLoading] = useState(!menu)
  const [unavailable, setUnavailable] = useState(false)
  const [connection, setConnection] = useState<'checking' | 'online' | 'offline'>('checking')
  const [index, setIndex] = useState(0)
  const [playbackTick, setPlaybackTick] = useState(0)
  const [paused, setPaused] = useState(false)
  const [capacity, setCapacity] = useState(7)
  const [controls, setControls] = useState(true)
  const [notice, setNotice] = useState('')
  const pending = useRef<PublishedMenuDocument | null>(null)
  const current = useRef(menu)
  const lock = useRef<WakeLockHandle | null>(null)
  const requestedWake = useRef(false)
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pages = menu ? paginateMenu(menu.pages, capacity) : []
  const page = pages[index % (pages.length || 1)]

  const showControls = useCallback(() => {
    setControls(true)
    if (controlsTimer.current) clearTimeout(controlsTimer.current)
    controlsTimer.current = setTimeout(() => setControls(false), 7000)
  }, [])
  useEffect(() => () => { if (controlsTimer.current) clearTimeout(controlsTimer.current) }, [])
  useEffect(() => {
    const resize = () => {
      // Budget for the header/footer and wrapped descriptions, retaining a minimum type size.
      setCapacity(Math.max(2, Math.min(9, Math.floor((window.innerHeight - 250) / (window.innerWidth < 600 ? 80 : 75)))))
      setIndex(0)
    }
    resize(); window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  const advance = useCallback((direction = 1) => {
    setPlaybackTick(value => value + 1)
    if (pending.current) {
      const next = pending.current; pending.current = null; current.current = next
      setMenu(next); cacheMenu(next); setIndex(0)
    } else setIndex(i => pages.length ? (i + direction + pages.length) % pages.length : 0)
  }, [pages.length])
  useEffect(() => {
    if (!page || paused) return
    const timer = setTimeout(() => advance(), page.durationSeconds * 1000)
    return () => clearTimeout(timer)
  }, [advance, page?.id, page?.durationSeconds, page?.part, menu?.version, index, playbackTick, paused, capacity])

  useEffect(() => {
    let disposed = false
    let active: AbortController | null = null
    const refresh = async () => {
      if (active) return
      const controller = new AbortController(); active = controller
      const timeout = setTimeout(() => controller.abort(), 12_000)
      try {
        const response = await fetch(`${apiRoot}/api/v1/menu/published`, { credentials: 'omit', cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } })
        if (disposed) return
        if (response.status === 404) {
          pending.current = null; current.current = null; cacheMenu(null); setMenu(null); setUnavailable(true); setConnection('online'); return
        }
        if (!response.ok) throw new Error('Falha ao consultar cardápio')
        const next: unknown = await response.json()
        if (!isPublishedMenu(next)) throw new Error('Cardápio inválido')
        if (disposed) return
        setUnavailable(false); setConnection('online')
        if (!current.current) { current.current = next; setMenu(next); cacheMenu(next); setIndex(0) }
        else if (next.version > current.current.version) pending.current = next
      } catch { if (!disposed) setConnection('offline') }
      finally { clearTimeout(timeout); active = null; if (!disposed) setLoading(false) }
    }
    void refresh()
    const interval = setInterval(() => void refresh(), 30_000)
    const reconnect = () => void refresh()
    const offline = () => setConnection('offline')
    window.addEventListener('online', reconnect); window.addEventListener('offline', offline)
    return () => { disposed = true; active?.abort(); clearInterval(interval); window.removeEventListener('online', reconnect); window.removeEventListener('offline', offline) }
  }, [])

  const wake = useCallback(async () => {
    const navigatorWithWake = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockHandle> } }
    if (lock.current && !lock.current.released || document.visibilityState === 'hidden') return
    try { lock.current = await navigatorWithWake.wakeLock?.request('screen') ?? null } catch { /* Device settings remain available when wake lock is unsupported. */ }
  }, [])
  useEffect(() => {
    const visible = () => { if (requestedWake.current) void wake() }
    document.addEventListener('visibilitychange', visible)
    return () => { document.removeEventListener('visibilitychange', visible); void lock.current?.release().catch(() => {}) }
  }, [wake])
  async function start() {
    requestedWake.current = true; setPaused(false); setNotice('')
    try { if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen() }
    catch { setNotice('A apresentação continua nesta janela. Você também pode abrir pelo atalho do navegador.') }
    await wake(); showControls()
  }
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return
      if (event.key === 'ArrowRight') { event.preventDefault(); advance(); showControls() }
      if (event.key === 'ArrowLeft') { event.preventDefault(); advance(-1); showControls() }
      if (event.code === 'Space') { event.preventDefault(); setPaused(value => !value); showControls() }
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [advance, showControls])

  return <main className="menu-presentation" onPointerMove={showControls} onPointerDown={showControls}>
    {page && menu ? <MenuSlide key={`${menu.version}:${page.id}:${page.part}`} title={menu.title} page={page} /> : <section className="menu-display-empty"><h1>Cardápio</h1><p role="status">{loading ? 'Carregando cardápio…' : unavailable ? 'O cardápio ainda não foi publicado.' : 'Não foi possível carregar o cardápio. Tentaremos novamente ao reconectar.'}</p></section>}
    {connection === 'offline' && <p className="menu-connection" role="status">{menu ? 'Sem conexão • exibindo a última versão carregada' : 'Sem conexão'}</p>}
    {notice && <p className="menu-display-notice" role="status">{notice}</p>}
    <nav className={`menu-player-controls${controls || paused || !page ? '' : ' menu-controls-hidden'}`} aria-label="Controles da apresentação" onFocus={showControls}>
      <button type="button" onClick={() => void start()} disabled={!page}>Tela cheia</button>
      <button type="button" aria-label="Página anterior" onClick={() => advance(-1)} disabled={!page}>←</button>
      <button type="button" onClick={() => { setPaused(value => !value); showControls() }} disabled={!page}>{paused ? 'Continuar' : 'Pausar'}</button>
      <span aria-live="off">{page ? `${index % pages.length + 1} / ${pages.length}` : '—'}</span>
      <button type="button" aria-label="Próxima página" onClick={() => advance()} disabled={!page}>→</button>
    </nav>
  </main>
}
export default MenuPresentationPage
