import { useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useOperations } from '../features/operations/DemoDataProvider'
import './arena-pages.css'

export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
export const currency = (amount: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount)
export const quantity = (amount: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(amount)
export function validDate(value: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0,4)) < 1) return false; const date = new Date(`${value}T00:00:00Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value }
export function displayDate(value?: string) { if (!value) return 'Não informado'; const date = new Date(value.length === 10 ? `${value}T12:00:00-03:00` : value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short' }).format(date) : 'Data não disponível' }
export function Heading({ eyebrow = 'Gestão da arena', title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) { return <header className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</header> }
export type AreaIconName = 'agenda' | 'school' | 'finance' | 'team' | 'materials' | 'projects' | 'maintenance' | 'bar'
const areaIconPaths: Record<AreaIconName, string> = {
  agenda: 'M5 5h14v15H5z M8 3v4 M16 3v4 M5 10h14 M8 14h2 M14 14h2 M8 17h2',
  school: 'M2 9l10-5 10 5-10 5z M6 11v6c4 3 8 3 12 0v-6 M22 9v8',
  finance: 'M4 4v16h16 M8 16v-4 M12 16V8 M16 16v-7 M20 16V5',
  team: 'M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M2 21v-2a6 6 0 0 1 12 0v2 M16 5a4 4 0 0 1 0 8 M17 16a5 5 0 0 1 5 5',
  materials: 'M3 7l9-4 9 4v11l-9 4-9-4z M3 7l9 4 9-4 M12 11v11 M7 5l10 4',
  projects: 'M9 4H5v17h14V4h-4 M9 2h6v5H9z M8 12l2 2 5-5 M8 18h8',
  maintenance: 'M15 4a6 6 0 0 0-6 8l-6 6a2 2 0 0 0 3 3l6-6a6 6 0 0 0 8-6l-4 3-3-3z',
  bar: 'M5 9h12v9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z M17 10h2a3 3 0 0 1 0 6h-2 M8 3v3 M12 2v4 M16 3v3',
}
export function AreaIcon({ name }: { name: AreaIconName }) { return <span className="arena-area-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={areaIconPaths[name]} /></svg></span> }
export function ListSummary({ count, label }: { count: number; label: string }) {
  const { dataUpdatedAt, persistenceStatus } = useOperations()
  return <div className="arena-list-summary"><strong>{dataUpdatedAt ? `${quantity(count)} ${label}` : 'Carregando seleção…'}</strong><span>{persistenceStatus === 'error' ? 'A atualização precisa ser confirmada' : 'Nesta seleção'}</span></div>
}
export function Field({ label, value, onChange, type = 'text', required = false, min, max, step, options, placeholder, disabled }: { label: string; value: string | number; onChange: (value: string) => void; type?: string; required?: boolean; min?: number; max?: number; step?: string; options?: (string | { value: string; label: string })[]; placeholder?: string; disabled?: boolean }) {
  return <label className="operation-field">{label}{options ? <select value={value} required={required} disabled={disabled} onChange={event => onChange(event.target.value)}>{options.map(option => typeof option === 'string' ? <option key={option}>{option}</option> : <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input value={value} type={type === 'end-time' ? 'text' : type} pattern={type === 'end-time' ? '(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00' : undefined} title={type === 'end-time' ? 'Use HH:mm; meia-noite no fim do dia é 24:00.' : undefined} required={required} min={min} max={max} step={step ?? (type === 'number' ? 'any' : undefined)} placeholder={placeholder} disabled={disabled} onChange={event => onChange(event.target.value)} />}</label>
}
export function Notes({ label = 'Observações', value, onChange }: { label?: string; value: string; onChange: (value: string) => void }) { return <label className="operation-field operation-field-wide">{label}<textarea value={value} rows={3} onChange={event => onChange(event.target.value)} /></label> }
export function Group({ title, children }: { title: string; children: ReactNode }) { return <fieldset className="arena-form-group"><legend>{title}</legend><div className="field-grid">{children}</div></fieldset> }
export function SaveRow({ onCancel, label = 'Salvar cadastro', busy = false, disabled = false }: { onCancel?: () => void; label?: string; busy?: boolean; disabled?: boolean }) { return <div className="form-actions"><button className="primary-button" type="submit" disabled={busy || disabled}>{busy ? 'Salvando…' : label}</button>{onCancel && <button className="secondary-link" type="button" onClick={onCancel} disabled={busy}>Cancelar</button>}</div> }
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) { return <div className="empty-state"><span aria-hidden="true">☀</span><p>{children}</p>{action}</div> }
export function DetailList({ items }: { items: [string, ReactNode][] }) { return <dl className="detail-list">{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Não informado'}</dd></div>)}</dl> }
export function Status({ children, warning = false }: { children: ReactNode; warning?: boolean }) { return <span className={`status-pill ${warning ? 'arena-warning' : ''}`}>{warning && <span aria-hidden="true">! </span>}{children}</span> }
export function useFilters() {
  const [params, setParams] = useSearchParams()
  const set = (key: string, value: string) => { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); if (key !== 'page') next.delete('page'); setParams(next) }
  const href = (path: string, changes?: Record<string, string>) => { const next = new URLSearchParams(params); if (changes) for (const [key, value] of Object.entries(changes)) value ? next.set(key, value) : next.delete(key); return `${path}${next.size ? `?${next}` : ''}` }
  return { params, set, href, query: params.get('q') ?? '', status: params.get('status') ?? '' }
}
export function Search({ filters, placeholder = 'Buscar pelo nome…' }: { filters: ReturnType<typeof useFilters>; placeholder?: string }) { return <label className="search-box"><span aria-hidden="true">⌕</span><input type="search" aria-label="Buscar" placeholder={placeholder} value={filters.query} onChange={event => filters.set('q', event.target.value)} /></label> }
export function useSave() {
  const locked = useRef(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('')
  async function run<T>(action: () => Promise<T>, success = 'Cadastro salvo.') {
    if (locked.current) return undefined
    locked.current = true; setBusy(true); setError(''); setMessage('')
    try { const result = await action(); setMessage(success); return result }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar. Confira sua conexão e tente novamente.'); return undefined }
    finally { locked.current = false; setBusy(false) }
  }
  return { busy, error, message, run }
}
export function Feedback({ action }: { action?: ReturnType<typeof useSave> }) {
  const { persistenceStatus, persistenceMessage } = useOperations()
  return <>{action?.error && <p className="arena-message arena-error" role="alert">{action.error}</p>}{action?.message && <p className="arena-message" role="status">{action.message}</p>}{persistenceStatus === 'connecting' && <p className="arena-message" role="status">Carregando registros da arena…</p>}{persistenceStatus === 'error' && <p className="arena-message arena-error" role="alert">{persistenceMessage || 'Não foi possível atualizar os registros. Os números podem estar desatualizados.'}</p>}</>
}
export function NoAccess() { return <main className="operation-page arena-page"><Heading title="Acesso restrito" description="Sua conta não possui acesso a esta área da arena." /><Link className="secondary-link" to="/">Voltar ao início</Link></main> }
export function Breadcrumb({ to, label }: { to: string; label: string }) { return <div className="breadcrumb"><Link to={to}>← {label}</Link></div> }
export function Pagination({ total, children }: { total: number; children: (start: number, end: number) => ReactNode }) {
  const filters = useFilters(); const pages = Math.max(1, Math.ceil(total / 20)); const raw = Number(filters.params.get('page') ?? 1); const page = Math.min(pages, Math.max(1, Number.isInteger(raw) ? raw : 1))
  return <>{children((page - 1) * 20, page * 20)}{pages > 1 && <nav className="arena-pagination" aria-label="Páginas dos registros"><button className="secondary-link" disabled={page <= 1} onClick={() => filters.set('page', String(page - 1))}>Anterior</button><span>{page} de {pages} · {total} registros</span><button className="secondary-link" disabled={page >= pages} onClick={() => filters.set('page', String(page + 1))}>Próxima</button></nav>}</>
}
