import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useBlocker, useLocation, useNavigationType, useSearchParams, UNSAFE_DataRouterContext, type LinkProps } from 'react-router-dom'
import './management-ui.css'

const UnsavedContext = createContext({ markSaved: () => {}, setDirty: (_dirty: boolean) => {}, dirty: false })
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  const update = (value: boolean) => { dirtyRef.current = value; setDirty(value) }
  const blocker = useBlocker(() => dirtyRef.current)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm('Há alterações não salvas. Deseja sair e descartá-las?')) { update(false); blocker.proceed() }
    else blocker.reset()
  }, [blocker])
  return <UnsavedContext.Provider value={{ dirty, setDirty: update, markSaved: () => update(false) }}>{children}</UnsavedContext.Provider>
}
export function OptionalUnsavedProvider({ children }: { children: ReactNode }) {
  const router = useContext(UNSAFE_DataRouterContext)
  return router ? <UnsavedChangesProvider>{children}</UnsavedChangesProvider> : children
}
export const useUnsavedChanges = () => useContext(UnsavedContext)

export function useContextSearchParams() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const router = useContext(UNSAFE_DataRouterContext)?.router
  const update: typeof setParams = (next, options) => {
    // Router callbacks use the render's search snapshot, not a queued value.
    // Read the accepted navigation instead so rapid actions from separate hooks
    // compose without reviving a closed editor. Blocked/reset navigations never
    // become this base, and POP navigation remains authoritative.
    const pending = router?.state.navigation.state !== 'idle' ? router?.state.navigation.location : undefined
    const committed = router?.state.location
    const current = pending?.pathname === location.pathname ? pending
      : committed?.pathname === location.pathname ? committed : location
    const value = typeof next === 'function' ? next(new URLSearchParams(current.search)) : next
    setParams(value, { state: current.state, ...options })
  }
  return [params, update] as const
}

export function ModalPanel({ title, children, onClose, className = '' }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null); const titleId = useId()
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const element = dialog.current
    if (element?.showModal) element.showModal(); else element?.setAttribute('open', '')
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'
    return () => { if (element?.open && element.close) element.close(); document.body.style.overflow = overflow; requestAnimationFrame(() => { if (previous?.isConnected) previous.focus({preventScroll:true}) }) }
  }, [])
  return createPortal(<dialog ref={dialog} className={`management-dialog ${className}`} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose() }}>
    <header className="dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" className="dialog-close" aria-label={`Fechar ${title}`} onClick={onClose}>×</button></header>{children}
  </dialog>, document.body)
}

// Forms opt into the same close/reload/navigation guard; successful saves clear it synchronously.
export function EditorPanel({ title, children, onClose, busy = false, hasUnsavedChanges, className = '' }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; hasUnsavedChanges?: boolean; className?: string }) {
  const guard = useUnsavedChanges(); const dirty = useRef(false); const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', leave)
    return () => { window.removeEventListener('beforeunload', leave); guard.markSaved() }
    // A panel has one lifetime; current dirty state is held in the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { if (!guard.dirty) dirty.current = false }, [guard.dirty])
  useEffect(() => { if (hasUnsavedChanges !== undefined) dirty.current = hasUnsavedChanges }, [hasUnsavedChanges])
  const close = () => { if (busy) return; if (!dirty.current || window.confirm('Descartar as alterações não salvas?')) { guard.markSaved(); onClose() } }
  return <ModalPanel title={title} onClose={close} className={`editor-panel ${className}`}><div ref={body} className="editor-body" onChangeCapture={event => { if ((event.target as HTMLElement).closest('[data-unsaved-ignore]')) return; dirty.current = true; guard.setDirty(true) }} onInvalidCapture={event => {
    let parent = event.target as HTMLElement | null
    while (parent && parent !== body.current) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement }
    requestAnimationFrame(() => (event.target as HTMLElement).focus())
  }} onClickCapture={event => {
    const button = (event.target as HTMLElement).closest('button')
    if (button?.type === 'button' && button.textContent?.trim() === 'Cancelar') { event.preventDefault(); event.stopPropagation(); close() }
    else if (button?.type === 'button' && button.closest('form')) { dirty.current = true; guard.setDirty(true) }
  }}>{children}</div></ModalPanel>
}

export function Disclosure({ title, children, count, open = false, lazy = false }: { title: string; children: ReactNode; count?: number; open?: boolean; lazy?: boolean }) {
  const [expanded,setExpanded]=useState(open)
  return <details className="management-disclosure" open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)}><summary>{title}{Boolean(count) && <span className="filter-count">{count}</span>}</summary><div className="disclosure-content">{!lazy||expanded?children:null}</div></details>
}
export function ActionPanel({ title, action, record, busy, children, primary = false, closeLabel = 'Cancelar' }: { title:string; action:string; record?:string; busy?:boolean; children:ReactNode; primary?:boolean; closeLabel?:string }) {
  const [params,setParams]=useContextSearchParams()
  const open=params.get('acao')===action&&(params.get('registro')||undefined)===record
  const show=()=>{const next=new URLSearchParams(params);next.set('acao',action);if(record)next.set('registro',record);else next.delete('registro');setParams(next,{preventScrollReset:true})}
  const close=()=>{const next=new URLSearchParams(params);next.delete('acao');next.delete('registro');setParams(next,{replace:true,preventScrollReset:true})}
  return <><button type="button" className={primary?'primary-button':'secondary-link'} onClick={show}>{title}</button>{open&&<EditorPanel title={title} busy={busy} onClose={close}>{children}<button className="secondary-link" type="button" disabled={busy} onClick={close}>{closeLabel}</button></EditorPanel>}</>
}
export function RecordTable({ columns, rows, label }: { columns: string[]; rows: { key:string; cells:ReactNode[] }[]; label:string }) {
  return <div className="responsive-records"><table aria-label={label}><thead><tr>{columns.map(column=><th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.key}>{row.cells.map((cell,index)=><td key={columns[index]} data-label={columns[index]}>{cell}</td>)}</tr>)}</tbody></table></div>
}
export function SectionTabs({ items, value, onChange }: { items: { value: string; label: string }[]; value: string; onChange: (value: string) => void }) {
  return <nav className="section-tabs" aria-label="Seções da ficha">{items.map(item => <button key={item.value} type="button" aria-current={value === item.value ? 'page' : undefined} onClick={() => onChange(item.value)}>{item.label}</button>)}</nav>
}
export function useSection(items: string[], fallback = items[0]) {
  const [params, setParams] = useContextSearchParams()
  const value = items.includes(params.get('secao') ?? '') ? params.get('secao')! : fallback
  return [value, (section: string) => { const next = new URLSearchParams(params); next.set('secao', section); next.delete('page'); setParams(next, { preventScrollReset: true }) }] as const
}
export function useEditorQuery(defaultOpen = false, record?: string) {
  const [params, setParams] = useContextSearchParams()
  const open = defaultOpen || params.get('acao') === 'editar' || params.get('acao') === 'novo'
  const setOpen = (value: boolean) => {
    const next = new URLSearchParams(params)
    if (value) { next.set('acao', record ? 'editar' : 'novo'); if (record) next.set('registro', record) }
    else { next.delete('acao'); next.delete('registro') }
    setParams(next, { replace: !value, preventScrollReset: true })
  }
  return [open, setOpen] as const
}

export function safeReturn(value: unknown): value is string {
  return typeof value === 'string' && /^\/(agenda|mensalistas|escola|alunos|clientes|financeiro|equipe|estoque|projetos|manutencao|bar|atendimento)(?:[/?]|$)/.test(value) && !value.includes('\\')
}
export function ContextLink({ children, state, ...props }: LinkProps) {
  const location = useLocation()
  return <Link {...props} state={{ returnTo: location.pathname + location.search, returnLabel: 'Voltar à página anterior', returnState: location.state, ...state }}>{children}</Link>
}
export function useRecordForm<T extends { id: string }>(records: T[], blank: () => Omit<T, 'id'>) {
  const [params, setParams] = useContextSearchParams()
  const [form, setForm] = useState<Omit<T, 'id'> | null>(null)
  const editId = params.get('registro') || undefined
  const action = params.get('acao')
  const hydrated = useRef('')
  const existing = records.find(item => item.id === editId)
  useEffect(() => {
    if (action !== 'novo' && action !== 'editar') { hydrated.current = ''; setForm(null); return }
    const key = action + ':' + (editId ?? '')
    if (hydrated.current !== key && (action === 'novo' || existing)) { hydrated.current = key; setForm(existing ? { ...existing } : blank()) }
  }, [action, editId, existing, form, blank])
  const open = (item?: T) => {
    const next = new URLSearchParams(params); next.set('acao', item ? 'editar' : 'novo')
    if (item) next.set('registro', item.id); else next.delete('registro')
    // Mount the form only after the URL transition commits. Rendering it earlier
    // lets the previous action's effect clear a field while the user is typing.
    setParams(next, { preventScrollReset: true })
  }
  const close = () => { const next = new URLSearchParams(params); next.delete('acao'); next.delete('registro'); setForm(null); setParams(next, { replace: true, preventScrollReset: true }) }
  return { form, setForm, editId, open, close }
}
const listPaths = new Set(['/', '/agenda', '/mensalistas', '/escola', '/alunos', '/clientes', '/financeiro', '/financeiro/historico', '/financeiro/controle-mensal', '/equipe', '/administracao/materiais', '/projetos', '/manutencao', '/agenda/funcionamento', '/escola/matriculas', '/escola/presencas', '/bar/produtos', '/bar/estoque', '/bar/compras', '/bar/vendas', '/bar/caixa', '/bar/inventario', '/bar/receitas', '/bar/indicadores', '/atendimento/comandas'])
export function NavigationMemory() {
  const location = useLocation(); const type = useNavigationType(); const positions = useRef(new Map<string, number>())
  const previous = useRef('')
  useLayoutEffect(() => {
    const key = location.pathname + location.search
    const samePage = previous.current.split('?')[0] === location.pathname
    const target = type === 'POP' || listPaths.has(location.pathname) ? positions.current.get(key) ?? 0 : 0
    const restore = !samePage || type === 'POP' || Boolean(location.state?.restoreList)
    previous.current = key
    let timer: ReturnType<typeof setTimeout> | undefined
    let observer: ResizeObserver | undefined
    if (restore) {
      window.scrollTo(0, target)
      if (target && typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => window.scrollTo(0, target))
        observer.observe(document.body)
        timer = setTimeout(() => observer?.disconnect(), 1500)
      }
    }
    const stopRestore = () => observer?.disconnect()
    window.addEventListener('wheel', stopRestore, { passive: true }); window.addEventListener('touchstart', stopRestore, { passive: true })
    return () => { positions.current.set(key, window.scrollY); observer?.disconnect(); clearTimeout(timer); window.removeEventListener('wheel', stopRestore); window.removeEventListener('touchstart', stopRestore) }
  }, [location.key, location.pathname, location.search, location.state, type])
  return null
}
