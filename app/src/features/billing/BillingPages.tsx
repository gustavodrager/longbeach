import { CopyPix } from '../../components/CopyPix'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/http'
import { useAuth } from '../auth/authContext'
import { money } from '../attendance/api'
import { AccountCheckout } from './AccountCheckout'
import { post, date, stateLabel, type Account, type Candidates, type Config, type Payment, type Subscription } from './api'
import './billing.css'
import { downloadReceipt } from './receipt'

function PaymentHistory({ account, base, admin, refresh }: { account: Account; base: string; admin: boolean; refresh: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [refund, setRefund] = useState<Payment>(); const [value, setValue] = useState(''); const [reason, setReason] = useState(''); const [operation, setOperation] = useState('')
  async function run(path: string, body: unknown) { setBusy(true); setError(''); try { await post(path, body); await refresh() } catch (e) { setError(e instanceof Error ? e.message : 'Confira a operação.'); await refresh() } finally { setBusy(false) } }
  return <section aria-label="Histórico de pagamentos">{account.payments.map(p => <article className="billing-payment" key={p.id}><div><strong>{stateLabel(p.state)} · {money(p.amount)}</strong><p>{p.method === 'CreditCard' ? 'Crédito à vista' : p.method === 'Subscription' ? 'Mensalidade automática' : p.method === 'Cash' ? 'Dinheiro' : p.method === 'CardManual' ? 'Cartão na maquininha' : p.method} · {date(p.paidAtUtc)}</p><small>Pagamento {p.id}</small></div>
    {(p.refundPending ?? 0) > 0 && <p role="status">Estorno aguardando confirmação: {money(p.refundPending ?? 0)}</p>}{p.refunded > 0 && <p>Estornado: {money(p.refunded)}</p>}
    {p.state === 'Pending' && <><p>O valor permanece reservado até a confirmação.</p>{p.qrImageUrl && <img className="lb-pix-qr" src={p.qrImageUrl} alt="QR Code Pix desta conta" referrerPolicy="no-referrer" />}{p.pixText && <CopyPix code={p.pixText} />}<button disabled={busy} onClick={() => void run(`${base}/accounts/${account.id}/payments/${p.id}/refresh`, {})}>Consultar confirmação</button></>}
    {p.state === 'Approved' && <button onClick={() => downloadReceipt(account, p)}>Baixar comprovante</button>}
    {admin && p.state === 'Approved' && p.amount > p.refunded && !(p.refundPending ?? 0) && <button disabled={busy} onClick={() => { setRefund(p); setValue(String(p.amount - p.refunded)); setReason(''); setOperation(crypto.randomUUID()) }}>Estornar</button>}
  </article>)}
    {refund && <form onSubmit={e => { e.preventDefault(); void run(`${base}/accounts/${account.id}/payments/${refund.id}/refund`, { operationId: operation, amount: Number(value.replace(',', '.')), reason }) }}><h4>Estornar pagamento</h4><label className="ux-field">Valor<input required inputMode="decimal" value={value} disabled={busy || refund.method === 'Subscription'} onChange={e => setValue(e.target.value)} /></label><label className="ux-field">Motivo<input required minLength={3} maxLength={500} value={reason} disabled={busy} onChange={e => setReason(e.target.value)} /></label><button disabled={busy}>Solicitar estorno</button><button type="button" disabled={busy} onClick={() => setRefund(undefined)}>Fechar</button></form>}
    {error && <p role="alert">{error}</p>}
  </section>
}

export function BillingPage({ admin = false }: { admin?: boolean }) {
  const { user } = useAuth(); const cache = useQueryClient(); const base = admin ? '/api/v1/billing' : '/api/v1/me/billing'
  const accounts = useQuery({ queryKey: ['billing', user?.id, base], queryFn: () => apiFetch<Account[]>(`${base}/accounts`), refetchInterval: 15000 })
  const config = useQuery({ queryKey: ['billing-config', user?.id], queryFn: () => apiFetch<Config>('/api/v1/me/billing/config') })
  const subscriptions = useQuery({ queryKey: ['billing-subscriptions', user?.id], queryFn: () => apiFetch<Subscription[]>('/api/v1/me/billing/subscriptions'), enabled: !admin, refetchInterval: 15000 })
  const candidates = useQuery({ queryKey: ['billing-candidates', user?.id], queryFn: () => apiFetch<Candidates>('/api/v1/billing/candidates'), enabled: admin })
  const [filter, setFilter] = useState('due')
  const [cancelReview, setCancelReview] = useState<Subscription | null>(null)
  const [selected, setSelected] = useState(''); const [mode, setMode] = useState<'pay' | 'subscribe'>('pay'); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const [source, setSource] = useState(''); const [owner, setOwner] = useState(''); const [student, setStudent] = useState('')
  const canManage = admin && Boolean(user?.permissions.includes('finance:write') || user?.roles.includes('Owner'))
  async function refresh() { await cache.invalidateQueries({ queryKey: ['billing'] }); await cache.invalidateQueries({ queryKey: ['billing-subscriptions'] }) }
  async function assign() {
    const candidate = candidates.data?.accounts.find(a => a.id === source); if (!candidate) return
    setBusy(true); setError(''); try { await post('/api/v1/billing/accounts', { kind: candidate.kind, sourceId: source, userId: owner, studentId: student || null }); setSource(''); await refresh(); await candidates.refetch() } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível vincular.') } finally { setBusy(false) }
  }
  async function cancel(s: Subscription) { setBusy(true); setError(''); try { await post(`/api/v1/me/billing/subscriptions/${s.id}/cancel`, { operationId: crypto.randomUUID() }); await refresh() } catch (e) { setError(e instanceof Error ? e.message : 'Cancelamento em confirmação.') } finally { setBusy(false) } }
  const matchesFilter = (a: Account) => admin || a.id === selected || filter === 'due' && a.payable > 0 || filter === 'pending' && (a.pending > 0 || a.payments.some(p => p.state === 'Pending')) || filter === 'history' && (a.payments.length > 0 || a.payable === 0 && a.pending === 0)
  const competenceLabel = (month: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`)) : month
  const accessible = !accounts.error || !('status' in accounts.error) || ![401, 403].includes(Number(accounts.error.status))
  return <main className="billing-page"><header className="page-heading"><div><p className="eyebrow">Long Beach Arena</p><h1>{admin ? 'Recebimentos' : 'Pagamentos'}</h1><p>{admin ? 'Acompanhe Bar, Quadra e mensalidades.' : 'Consulte e pague suas contas do Bar e da Quadra.'}</p></div>{admin && <Link to="/recebimentos/conciliacao">Conciliação PagBank</Link>}</header>
    {accounts.isPending && <p role="status">Carregando contas…</p>}{accounts.error && <p role="alert">Não foi possível consultar suas contas. <button onClick={() => void accounts.refetch()}>Tentar novamente</button></p>}
    {config.error && <p role="alert">Os meios de pagamento estão indisponíveis. <button onClick={() => void config.refetch()}>Consultar novamente</button></p>}
    {error && <p role="alert">{error}</p>}
    {cancelReview && <section className="ux-panel" aria-label="Confirmar cancelamento da assinatura"><h2>Cancelar cobranças futuras?</h2><p>Isso não cancela sua matrícula, suas aulas ou valores já cobrados. A alteração será concluída após a confirmação do provedor.</p><button disabled={busy} onClick={async()=>{await cancel(cancelReview);setCancelReview(null)}}>Confirmar cancelamento</button><button disabled={busy} onClick={()=>setCancelReview(null)}>Manter mensalidade automática</button></section>}
    {canManage && <details className="ux-panel"><summary>Vincular conta ao responsável</summary><form onSubmit={e => { e.preventDefault(); void assign() }}><label className="ux-field">Conta<select required value={source} onChange={e => setSource(e.target.value)}><option value="">Selecione a conta existente</option>{candidates.data?.accounts.map(a => <option key={a.id} value={a.id}>{a.kind} · {a.name}</option>)}</select></label><label className="ux-field">Responsável financeiro<select required value={owner} onChange={e => setOwner(e.target.value)}><option value="">Selecione um usuário</option>{candidates.data?.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label className="ux-field">Aluno vinculado<select value={student} onChange={e => setStudent(e.target.value)}><option value="">Sem vínculo com matrícula</option>{candidates.data?.students.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label><p>Para grupos, selecione apenas o responsável pelo valor integral.</p><button disabled={busy}>Confirmar vínculo</button></form></details>}
    {!admin && <nav className="portal-filters" aria-label="Situação dos pagamentos">{[['due','A pagar'],['pending','Em confirmação'],['history','Histórico']].map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>{setFilter(key);setSelected('')}}>{label}</button>)}</nav>}
    {accessible && ['Bar', 'Quadra'].map(kind => <section key={kind} aria-label={`Conta ${kind === 'Bar' ? 'do Bar' : 'da Quadra'}`}><h2>Conta {kind === 'Bar' ? 'do Bar' : 'da Quadra'}</h2>{accounts.data && !accounts.data.some(a => a.kind === kind && matchesFilter(a)) && <p>Nenhuma conta nesta seleção.</p>}
      {accounts.data?.filter(a => a.kind === kind && matchesFilter(a)).map(a => { const sub = subscriptions.data?.find(s => s.id === a.subscriptionId && !['CANCELED', 'EXPIRED'].includes(s.state)); const pending = a.payments.find(p => p.canResume); return <article className="ux-panel billing-account" key={a.id}>
        <header><div><h3>{a.title}</h3><p>{a.competence && `Mensalidade de ${competenceLabel(a.competence)} · `}{date(a.dueDate)}</p>{admin && <p>Responsável: {candidates.data?.users.find(u => u.id === a.userId)?.name ?? 'Usuário vinculado'}</p>}</div><strong>{money(a.payable)} a pagar agora</strong></header>
        <dl className="billing-totals"><div><dt>Total</dt><dd>{money(a.total)}</dd></div><div><dt>Já pago</dt><dd>{money(a.paid)}</dd></div><div><dt>Em confirmação</dt><dd>{money(a.pending)}</dd></div></dl>
        {a.payable > 0 && !a.subscriptionId && (!admin || canManage) && <div className="ux-actions"><button onClick={() => { setSelected(a.id); setMode('pay') }}>Pagar esta conta</button>{!admin && a.recurringEligible && config.data?.subscriptionsEnabled && <button onClick={() => { setSelected(a.id); setMode('subscribe') }}>Ativar mensalidade automática</button>}</div>}
        {pending && <button onClick={() => { setSelected(a.id); setMode('pay') }}>Retomar pagamento pendente</button>}
        {a.subscriptionId && !sub && <p>Mensalidade automática vinculada. Consulte o responsável pela assinatura.</p>}{sub && <div className="billing-subscription"><p>Mensalidade automática: {stateLabel(sub.state)} · {money(sub.amount)}</p>{sub.canResume ? <button onClick={() => { setSelected(a.id); setMode('subscribe') }}>Retomar adesão</button> : <button disabled={busy} onClick={() => setCancelReview(sub)}>Cancelar cobranças futuras</button>}</div>}
        {selected === a.id && config.data && (a.payable > 0 || pending || sub?.canResume) && <AccountCheckout key={`${a.id}:${mode}:${pending?.id ?? ''}`} account={a} config={config.data} base={base} resume={mode === 'pay' ? pending : undefined} subscription={mode === 'subscribe'} subscriptionOperationId={sub?.operationId} done={refresh} />}
        <PaymentHistory account={a} base={base} admin={canManage} refresh={refresh} />
      </article> })}</section>)}
  </main>
}
