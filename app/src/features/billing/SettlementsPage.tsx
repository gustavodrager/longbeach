import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../lib/http'
import { post, type Account } from './api'
import { useAuth } from '../auth/authContext'
import './billing.css'
import { money } from '../attendance/api'
type Record = { documentId: string; externalId: string; transactionId: string; gross: number; net: number; date: string }
export function SettlementsPage() {
  const { user } = useAuth(); const canManage = Boolean(user?.permissions.includes('finance:write') || user?.roles.includes('Owner'))
  const query = useQuery({ queryKey: ['billing-settlements'], queryFn: () => apiFetch<{ records: Record[]; settlements: { id: string; gross: number; fee: number; net: number; date: string }[] }>('/api/v1/billing/settlements') })
  const accounts = useQuery({ queryKey: ['billing', 'settlement-accounts'], queryFn: () => apiFetch<Account[]>('/api/v1/billing/accounts') })
  const [record, setRecord] = useState(''); const [payment, setPayment] = useState(''); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function match() {
    const r = query.data?.records.find(x => x.externalId === record); const a = accounts.data?.find(x => x.payments.some(p => p.id === payment)); if (!r || !a) return
    setBusy(true); setError(''); try { await post(`/api/v1/billing/accounts/${a.id}/settlements`, { paymentId: payment, documentId: r.documentId, externalId: r.externalId, reason }); await query.refetch(); setRecord(''); setPayment(''); setReason('') } catch (e) { setError(e instanceof Error ? e.message : 'Confira os valores.') } finally { setBusy(false) }
  }
  return <main className="billing-page"><h1>Conciliação PagBank</h1><p>Associe uma liquidação do extrato a um pagamento já confirmado. Essa conferência não cria uma nova receita.</p>{(query.error || accounts.error) && <p role="alert">Não foi possível consultar a conciliação.</p>}{error && <p role="alert">{error}</p>}
    {canManage && <form className="ux-panel" onSubmit={e => { e.preventDefault(); void match() }}><label className="ux-field">Liquidação<select required value={record} onChange={e => setRecord(e.target.value)}><option value="">Selecione o movimento EDI</option>{query.data?.records.map(r => <option key={`${r.documentId}:${r.externalId}`} value={r.externalId}>{r.date} · {money(r.gross)} · {r.transactionId}</option>)}</select></label><label className="ux-field">Pagamento<select required value={payment} onChange={e => setPayment(e.target.value)}><option value="">Selecione a conta e o pagamento</option>{accounts.data?.flatMap(a => a.payments.filter(p => p.state === 'Approved' && p.refunded === 0 && ['Pix', 'CreditCard', 'Subscription'].includes(p.method)).map(p => <option key={p.id} value={p.id}>{a.kind} · {a.title} · {money(p.amount)} · {p.id.slice(0, 8)}</option>))}</select></label><label className="ux-field">Como o vínculo foi conferido<input required minLength={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label><button disabled={busy}>Confirmar conciliação</button></form>}
    {query.data?.records.length === 0 && <p>Nenhuma liquidação elegível disponível. Verifique a ativação e a última coleta do EDI.</p>}
    <h2>Liquidações conferidas</h2>{query.data?.settlements.map(s => <article className="ux-panel" key={s.id}><p>{s.date} · Bruto {money(s.gross)} · Taxas {money(s.fee)} · Líquido {money(s.net)}</p></article>)}
  </main>
}
