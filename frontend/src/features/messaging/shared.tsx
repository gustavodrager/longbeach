import type { ReactNode } from 'react'
import { stateLabel, type MessageState, type Page } from './api'

export function QueryNotice({ query, label }: { query: { isPending: boolean; isError: boolean; data?: unknown; refetch: () => unknown }; label: string }) {
  if (query.isError) return <p role="alert" className="whatsapp-alert">Não foi possível {label}. <button className="text-button" type="button" onClick={() => void query.refetch()}>Tentar novamente</button></p>
  return query.isPending && !query.data ? <p role="status" className="whatsapp-notice">Carregando…</p> : null
}
export function ActionNotice({ action }: { action: { error: string; feedback: string } }) {
  return <>{action.error && <p className="whatsapp-alert" role="alert">{action.error}</p>}{action.feedback && <p className="whatsapp-notice" role="status">{action.feedback}</p>}</>
}
export function MessageStatus({ state }: { state: MessageState }) { return <span className={`whatsapp-message-state state-${state.toLowerCase()}`}>{stateLabel[state] ?? state}</span> }
export function Pagination({ data, busy, change }: { data?: Pick<Page<unknown>, 'page' | 'pageSize' | 'total'>; busy: boolean; change: (page: number) => void }) {
  if (!data || data.total <= data.pageSize) return null
  return <nav className="whatsapp-pagination" aria-label="Páginas"><button className="secondary-link" type="button" disabled={busy || data.page <= 1} onClick={() => change(data.page - 1)}>Anterior</button><span>{data.page} de {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><button className="secondary-link" type="button" disabled={busy || data.page * data.pageSize >= data.total} onClick={() => change(data.page + 1)}>Próxima</button></nav>
}
export function EmptyPanel({ title, children }: { title: string; children: ReactNode }) { return <section className="whatsapp-empty"><h2>{title}</h2><p>{children}</p></section> }
