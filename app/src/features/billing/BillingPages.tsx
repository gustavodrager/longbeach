import { paymentLabel } from '../attendance/api'
import { CopyPix } from '../../components/CopyPix'
import { PixQr } from '../../components/PixQr'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError, apiFetch } from '../../lib/http'
import { useAuth } from '../auth/authContext'
import { hasPermission } from '../auth/access'
import { money } from '../attendance/api'
import { AccountItems } from './AccountItems'
import { AccountCheckout } from './AccountCheckout'
import { post, date, paymentDate, paymentStateLabel, stateLabel, pixEnabledFor, type Account, type Candidates, type Config, type Payment, type Subscription } from './api'
import './billing.css'
import { downloadReceipt } from './receipt'
import { accountSituation, isOverdue, matchesPaymentSelection, paymentInSource, paymentOverview, sortPaymentAccounts, type PaymentSituation, type PaymentUnit } from './paymentOverview'

function PaymentHistory({ account, base, admin, refresh }: { account: Account; base: string; admin: boolean; refresh: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [refund, setRefund] = useState<Payment>(); const [value, setValue] = useState(''); const [reason, setReason] = useState(''); const [operation, setOperation] = useState('')
  const linked = account.isLinked !== false
  async function run(path: string, body: unknown) { if (!linked) return; setBusy(true); setError(''); try { await post(path, body); await refresh() } catch (e) { setError(e instanceof Error ? e.message : 'Confira a operação.'); await refresh() } finally { setBusy(false) } }
  return <section aria-label="Histórico de pagamentos">{paymentInSource(account) ? <p>Pagamento informado no lançamento: {money(account.paid)}. Não há confirmação da operadora registrada nesta conta.</p> : account.payments.length === 0 && <p>Nenhum pagamento registrado nesta conta.</p>}{account.payments.map(p => <article className="billing-payment" key={p.id}><div><strong>{paymentStateLabel(p)} · {money(p.amount)}</strong><p>{p.method === 'CreditCard' ? 'Crédito à vista' : p.method === 'Subscription' ? 'Mensalidade automática' : p.method === 'Cash' ? 'Dinheiro' : paymentLabel(p)}{p.paidAtUtc ? ` · Pago em ${paymentDate(p.paidAtUtc)}` : ''}</p><small>Pagamento {p.id}</small></div>
    {(p.refundPending ?? 0) > 0 && <p role="status">Estorno aguardando confirmação: {money(p.refundPending ?? 0)}</p>}{p.refunded > 0 && <p>Estornado: {money(p.refunded)}</p>}
    {p.state === 'Pending' && <><p>Aguardando confirmação do pagamento. Este valor ainda não está quitado.</p>{p.expiresAtUtc && <p>Validade do Pix/cobrança: {new Date(p.expiresAtUtc).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Após esse horário, consulte a confirmação antes de tentar novamente.</p>}{p.qrImageUrl ? <img className="lb-pix-qr" src={p.qrImageUrl} alt="QR Code Pix desta conta" referrerPolicy="no-referrer" /> : p.pixText ? <PixQr code={p.pixText} /> : null}{p.pixText && <CopyPix code={p.pixText} />}{linked && <button disabled={busy} onClick={() => void run(`${base}/accounts/${account.id}/payments/${p.id}/refresh`, {})}>Consultar confirmação</button>}</>}
    {p.state === 'Approved' && <button onClick={() => downloadReceipt(account, p)}>Baixar comprovante</button>}
    {linked && admin && p.state === 'Approved' && p.amount > p.refunded && !(p.refundPending ?? 0) && <button disabled={busy} onClick={() => { setRefund(p); setValue(String(p.amount - p.refunded)); setReason(''); setOperation(crypto.randomUUID()) }}>Estornar</button>}
  </article>)}
    {linked && refund && <form onSubmit={e => { e.preventDefault(); void run(`${base}/accounts/${account.id}/payments/${refund.id}/refund`, { operationId: operation, amount: Number(value.replace(',', '.')), reason }) }}><h4>Estornar pagamento</h4><label className="ux-field">Valor<input required inputMode="decimal" value={value} disabled={busy || refund.method === 'Subscription'} onChange={e => setValue(e.target.value)} /></label><label className="ux-field">Motivo<input required minLength={3} maxLength={500} value={reason} disabled={busy} onChange={e => setReason(e.target.value)} /></label><button disabled={busy}>Solicitar estorno</button><button type="button" disabled={busy} onClick={() => setRefund(undefined)}>Fechar</button></form>}
    {error && <p role="alert">{error}</p>}
  </section>
}

export function BillingPage({ admin = false }: { admin?: boolean }) {
  const { user } = useAuth(); const cache = useQueryClient(); const base = admin ? '/api/v1/billing' : '/api/v1/me/billing'
  const accounts = useQuery({ queryKey: ['billing', user?.id, base], queryFn: () => apiFetch<Account[]>(`${base}/accounts`), refetchInterval: admin ? 60000 : 15000 })
  const config = useQuery({ queryKey: ['billing-config', user?.id], queryFn: () => apiFetch<Config>('/api/v1/me/billing/config') })
  const subscriptions = useQuery({ queryKey: ['billing-subscriptions', user?.id], queryFn: () => apiFetch<Subscription[]>('/api/v1/me/billing/subscriptions'), enabled: !admin, refetchInterval: 15000 })
  const candidates = useQuery({ queryKey: ['billing-candidates', user?.id], queryFn: () => apiFetch<Candidates>('/api/v1/billing/candidates'), enabled: admin })
  const [params, setParams] = useSearchParams(); const focused = admin ? '' : params.get('conta') ?? ''
  const [filter, setFilter] = useState('due')
  const [search, setSearch] = useState(''); const [situation, setSituation] = useState<PaymentSituation>('all'); const [unit, setUnit] = useState<PaymentUnit>('all')
  const [cancelReview, setCancelReview] = useState<Subscription | null>(null)
  const [selected, setSelected] = useState(''); const [mode, setMode] = useState<'pay' | 'subscribe'>('pay'); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const [source, setSource] = useState(''); const [owner, setOwner] = useState(''); const [student, setStudent] = useState('')
  const canManage = admin && Boolean(user?.permissions.includes('finance:write') || user?.roles.includes('Owner'))
  async function refresh() { await cache.invalidateQueries({ queryKey: ['billing'] }); await cache.invalidateQueries({ queryKey: ['billing-subscriptions'] }) }
  async function subscriptionUpdated(value: Subscription) {
    await cache.cancelQueries({ queryKey: ['billing-subscriptions', user?.id] })
    cache.setQueryData<Subscription[]>(['billing-subscriptions', user?.id], previous => [value, ...(previous ?? []).filter(s => s.id !== value.id)])
  }
  async function assign() {
    const candidate = candidates.data?.accounts.find(a => a.id === source); if (!candidates.isSuccess || !candidate || !canManage) return
    setBusy(true); setError(''); try { await post('/api/v1/billing/accounts', { kind: candidate.kind, sourceId: source, userId: owner, studentId: student || null }); setSource(''); await refresh(); await candidates.refetch() } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível vincular.') } finally { setBusy(false) }
  }
  async function cancel(s: Subscription) { setBusy(true); setError(''); try { await post(`/api/v1/me/billing/subscriptions/${s.id}/cancel`, { operationId: crypto.randomUUID() }); await refresh() } catch (e) { setError(e instanceof Error ? e.message : 'Cancelamento em confirmação.') } finally { setBusy(false) } }
  async function refreshSubscription(s: Subscription) {
    setBusy(true); setError('')
    try {
      const updated = await apiFetch<Subscription>(`/api/v1/me/billing/subscriptions/${s.id}/refresh`, { method: 'POST' })
      await subscriptionUpdated(updated); await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível consultar a adesão. Tente novamente.') }
    finally { setBusy(false) }
  }
  const matchesFilter = (a: Account) => admin || a.id === focused || a.id === selected || filter === 'due' && a.payable > 0 || filter === 'pending' && (a.pending > 0 || a.payments.some(p => p.state === 'Pending') || subscriptions.data?.some(s => s.id === a.subscriptionId && s.state === 'Creating')) || filter === 'history' && (a.payments.length > 0 || a.payable === 0 && a.pending === 0)
  const competenceLabel = (month: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`)) : month
  const accessible = !accounts.isError
  const sessionExpired = accounts.error instanceof ApiError && accounts.error.status === 401
  const totals = accounts.data?.reduce((sum, a) => ({ payable: sum.payable + a.payable, pending: sum.pending + a.pending, paid: sum.paid + a.paid }), { payable: 0, pending: 0, paid: 0 })
  const online = Boolean(config.data && !config.isError && (config.data.pixEnabled || config.data.cardEnabled))
  const responsible = (account: Account) => {
    if (account.isLinked === false) return 'Sem responsável vinculado'
    if (!candidates.isSuccess) return candidates.isError ? 'Responsável indisponível' : 'Consultando responsável…'
    return candidates.data.users.find(u => u.id === account.userId)?.name ?? 'Responsável vinculado'
  }
  const matchingAccounts = accounts.data?.filter(account => admin ? matchesPaymentSelection(account, situation, unit, candidates.isSuccess ? search : '', responsible(account)) : matchesFilter(account))
  const visibleAccounts = admin && matchingAccounts ? sortPaymentAccounts(matchingAccounts) : matchingAccounts
  const overview = visibleAccounts && paymentOverview(visibleAccounts)
  return <main className="billing-page"><header className="page-heading"><div><p className="eyebrow">Long Beach Arena</p><h1>{admin ? 'Recebimentos' : 'Pagamentos'}</h1><p>{admin ? 'Veja o que já foi recebido, o que falta receber e os pagamentos em confirmação.' : 'Mensalidades, reservas e bar: acompanhe suas contas e confirmações.'}</p></div></header>
    {accounts.isPending && <p role="status">Carregando contas…</p>}{accounts.error && <p role="alert">{sessionExpired ? <>Sua sessão expirou. <Link to="/login">Entrar novamente</Link> para consultar os pagamentos.</> : <>Não foi possível consultar suas contas. <button onClick={() => void accounts.refetch()}>Tentar novamente</button></>}</p>}
    {config.error && <p role="alert">Os meios de pagamento estão indisponíveis. <button onClick={() => void config.refetch()}>Consultar novamente</button></p>}
    {error && <p role="alert">{error}</p>}
    {!admin && accessible && totals && <section className="billing-summary" aria-label="Resumo das minhas contas"><div><span>Disponível para pagar</span><strong>{money(totals.payable)}</strong></div><div><span>Em confirmação</span><strong>{money(totals.pending)}</strong></div><div><span>Já pago nas contas vinculadas</span><strong>{money(totals.paid)}</strong></div></section>}
    {admin && accessible && accounts.isSuccess && <>
      <p className="billing-summary-note">Última consulta: {paymentDate(new Date(accounts.dataUpdatedAt).toISOString())} · horário de São Paulo.{accounts.isFetching && ' Atualizando…'}</p>
      <section className="billing-filters" aria-label="Filtrar recebimentos">
        <label className="ux-field billing-search">Buscar conta ou responsável<input type="search" value={search} disabled={!candidates.isSuccess} onChange={e => setSearch(e.target.value)} placeholder="Nome, comanda ou mensalidade" /></label>
        <label className="ux-field">Situação<select value={situation} onChange={e => setSituation(e.target.value as PaymentSituation)}><option value="all">Todas as situações</option><option value="due">A receber</option><option value="overdue">Vencidos</option><option value="pending">Em confirmação</option><option value="received">Com valor recebido</option><option value="refunds">Com estorno</option><option value="unsuccessful">Cancelados ou recusados</option></select></label>
        <label className="ux-field">Unidade<select value={unit} onChange={e => setUnit(e.target.value as PaymentUnit)}><option value="all">Bar e Quadra</option><option value="Bar">Bar</option><option value="Quadra">Quadra</option></select></label>
      </section>
      {candidates.isPending && <p role="status">Carregando responsáveis. A busca e o vínculo de contas estarão disponíveis após a consulta.</p>}
      {candidates.isError && <p role="alert">Não foi possível consultar os responsáveis. A busca está pausada e o vínculo de contas indisponível. As contas aparecem sem aplicar a busca. <button disabled={candidates.isFetching} onClick={() => void candidates.refetch()}>Consultar responsáveis novamente</button></p>}
      {overview && <section aria-label="Resumo dos recebimentos da seleção"><div className="billing-summary"><div><span>Recebido registrado</span><strong>{money(overview.paid)}</strong></div><div><span>Saldo a receber</span><strong>{money(overview.payable)}</strong></div><div><span>Em confirmação</span><strong>{money(overview.pending)}</strong></div></div><p className="billing-summary-note">Valores registrados nas contas, após estornos confirmados e antes das taxas. Pagamentos informados no lançamento aparecem identificados nos detalhes. O saldo a receber não inclui os pagamentos em confirmação.</p>{overview.refundPending > 0 && <p role="status">Estornos em confirmação: {money(overview.refundPending)}. Esse valor permanece no recebido até a confirmação.</p>}</section>}
      <p className="billing-selection-count">{visibleAccounts?.length ?? 0} conta(s) nesta seleção. Abra uma conta para ver detalhes e ações.{situation === 'all' && ' Em confirmação e vencidos aparecem primeiro.'}</p>
    </>}
    {!admin && config.data && !config.isError && !online && <p role="status">Pagamento online indisponível no momento. Você pode consultar suas contas e combinar o pagamento com a equipe. <Link to="/minha-area/ajuda">Falar com a equipe</Link></p>}
    {!admin && subscriptions.isError && <p role="alert">Não foi possível consultar as mensalidades automáticas. <button onClick={() => void subscriptions.refetch()}>Tentar novamente</button></p>}
    {!admin && !accessible && subscriptions.data?.filter(s => s.state === 'Creating' && !s.canResume).map(s => <section className="ux-panel" key={s.id} aria-label="Adesão pendente"><p role="status">Aguardando confirmação do PagBank. A consulta não inicia outra cobrança.</p><button disabled={busy} onClick={() => void refreshSubscription(s)}>Consultar adesão pendente</button></section>)}
    {focused && accessible && accounts.data && <p role="status">{accounts.data.some(a => a.id === focused) ? 'A conta escolhida também aparece nesta seleção.' : 'A conta indicada não está disponível para seu usuário.'} <button onClick={() => setParams({})}>Limpar seleção</button></p>}
    {cancelReview && <section className="ux-panel" aria-label="Confirmar cancelamento da assinatura"><h2>Cancelar cobranças futuras?</h2><p>Isso não cancela sua matrícula, suas aulas ou valores já cobrados. A alteração será concluída após a confirmação do provedor.</p><button disabled={busy} onClick={async()=>{await cancel(cancelReview);setCancelReview(null)}}>Confirmar cancelamento</button><button disabled={busy} onClick={()=>setCancelReview(null)}>Manter mensalidade automática</button></section>}
    {canManage && accessible && accounts.isSuccess && candidates.isSuccess && <details className="ux-panel"><summary>Vincular conta ao responsável</summary>{candidates.data.accounts.length === 0 ? <p>Nenhuma conta disponível para vínculo.</p> : candidates.data.users.length === 0 ? <p>Nenhum responsável ativo disponível para vínculo.</p> : <form onSubmit={e => { e.preventDefault(); void assign() }}><label className="ux-field">Conta<select required value={source} onChange={e => setSource(e.target.value)}><option value="">Selecione a conta existente</option>{candidates.data?.accounts.map(a => <option key={a.id} value={a.id}>{a.kind} · {a.name}</option>)}</select></label><label className="ux-field">Responsável financeiro<select required value={owner} onChange={e => setOwner(e.target.value)}><option value="">Selecione um usuário</option>{candidates.data?.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label className="ux-field">Aluno vinculado<select value={student} onChange={e => setStudent(e.target.value)}><option value="">Sem vínculo com matrícula</option>{candidates.data?.students.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label><p>Para grupos, selecione apenas o responsável pelo valor integral.</p><button disabled={busy}>Confirmar vínculo</button></form>}</details>}
    {!admin && <nav className="portal-filters" aria-label="Situação dos pagamentos">{[['due','A pagar'],['pending','Em confirmação'],['history','Histórico']].map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>{setFilter(key);setSelected('');setParams({})}}>{label}</button>)}</nav>}
    {accessible && (admin ? ['all'] : ['Bar', 'Quadra']).map(kind => <section key={kind} aria-label={admin ? 'Contas e recebimentos' : `Conta ${kind === 'Bar' ? 'do Bar' : 'da Quadra'}`}><h2>{admin ? 'Contas e recebimentos' : `Conta ${kind === 'Bar' ? 'do Bar' : 'da Quadra'}`}</h2>{accounts.data && !visibleAccounts?.some(a => kind === 'all' || a.kind === kind) && <p>Nenhuma conta nesta seleção.</p>}
      {visibleAccounts?.filter(a => kind === 'all' || a.kind === kind).map(a => {
        const linked = a.isLinked !== false
        const accountOnline = Boolean(config.data && !config.isError && (pixEnabledFor(config.data, a.kind) || config.data.cardEnabled))
        const linkedSubscription = subscriptions.data?.find(s => s.id === a.subscriptionId)
        const sub = linkedSubscription && !['CANCELED', 'EXPIRED', 'Rejected'].includes(linkedSubscription.state) ? linkedSubscription : subscriptions.data?.find(s => s.accountId === a.id && !['CANCELED', 'EXPIRED', 'Rejected'].includes(s.state))
        const hasSubscription = Boolean(sub || a.subscriptionId && !linkedSubscription)
        // The API returns attempts newest first. Keep this identity even while a new attempt is Creating.
        const lastRejection = subscriptions.data?.find(s => s.accountId === a.id && s.state === 'Rejected')
        const lastAttempt = subscriptions.data?.find(s => s.accountId === a.id)
        const pending = a.payments.find(p => p.canResume)
        const lastPayment = a.payments.reduce<Payment | undefined>((latest, payment) => {
          const paidAt = Date.parse(payment.paidAtUtc ?? '')
          if (!['Approved', 'Refunded'].includes(payment.state) || !Number.isFinite(paidAt)) return latest
          return !latest || paidAt > Date.parse(latest.paidAtUtc ?? '') ? payment : latest
        }, undefined)
        const details = <>
        <header><div><h3>{a.title}</h3><p>{a.competence && `Mensalidade de ${competenceLabel(a.competence)} · `}{date(a.dueDate)}</p>{admin && <p>Responsável: {responsible(a)}</p>}</div><strong>{money(a.payable)} a pagar agora</strong></header>
        <dl className="billing-totals"><div><dt>Total</dt><dd>{money(a.total)}</dd></div><div><dt>Já pago</dt><dd>{money(a.paid)}</dd></div><div><dt>Em confirmação</dt><dd>{money(a.pending)}</dd></div></dl>
        {admin && <p className="billing-account-origin">Origem: {a.kind === 'Bar' ? 'Comanda do Bar' : 'Conta da Quadra'} · {a.sourceId}</p>}
        {admin && !linked && <p>Conta exibida a partir da origem. {(a.kind === 'Quadra' || hasPermission(user, 'bar:sales:read')) && <Link to={a.kind === 'Bar' ? `/atendimento/comandas/${encodeURIComponent(a.sourceId)}` : `/financeiro/${encodeURIComponent(a.sourceId)}`}>{a.kind === 'Bar' ? 'Abrir comanda original' : 'Abrir lançamento original'}</Link>}</p>}
        {a.kind === 'Bar' && <AccountItems account={a} />}
        {lastRejection && lastAttempt?.state === 'Rejected' && !sub && <div role="status"><p>Última adesão não autorizada. {lastRejection.failureReason ?? 'A mensalidade automática não foi ativada.'}</p><p>Confira os dados e autorize uma nova tentativa.</p></div>}
        {linked && a.payable > 0 && !hasSubscription && (!admin || canManage) && <div className="ux-actions"><button disabled={!accountOnline} onClick={() => { setSelected(a.id); setMode('pay') }}>Pagar esta conta</button>{!admin && a.recurringEligible && config.data?.subscriptionsEnabled && <button disabled={!subscriptions.isSuccess} onClick={() => { setSelected(a.id); setMode('subscribe') }}>Ativar mensalidade automática</button>}</div>}
        {linked && pending && (!admin || canManage) && <button disabled={!config.data || config.isError || (pending.method !== 'Pix' && !config.data.cardEnabled)} onClick={() => { setSelected(a.id); setMode('pay') }}>Retomar pagamento pendente</button>}
        {hasSubscription && !sub && <p>Mensalidade automática vinculada. Consulte o responsável pela assinatura.</p>}{linked && sub && <div className="billing-subscription"><p>Mensalidade automática: {stateLabel(sub.state)} · {money(sub.amount)}</p>{sub.canResume ? <button onClick={() => { setSelected(a.id); setMode('subscribe') }}>Retomar adesão</button> : sub.state === 'Creating' ? <><p role="status">Aguardando confirmação do PagBank. A consulta não inicia outra cobrança.</p><button disabled={busy} onClick={() => void refreshSubscription(sub)}>Consultar adesão pendente</button></> : <button disabled={busy} onClick={() => setCancelReview(sub)}>Cancelar cobranças futuras</button>}</div>}
        {linked && (!admin || canManage) && selected === a.id && config.data && !config.isError && (a.payable > 0 || pending || sub?.canResume) && (mode !== 'subscribe' || !sub || sub.canResume) && <AccountCheckout key={`${a.id}:${mode}:${pending?.id ?? ''}:${mode === 'subscribe' ? lastRejection?.id ?? '' : ''}`} account={a} config={config.data} base={base} resume={mode === 'pay' ? pending : undefined} subscription={mode === 'subscribe'} subscriptionOperationId={sub?.operationId} subscriptionUpdateExistingCustomerCard={sub?.updateExistingCustomerCard} subscriptionUpdated={subscriptionUpdated} done={refresh} />}
        {admin ? <details className="billing-history"><summary>Histórico de pagamentos ({a.payments.length})</summary><PaymentHistory account={a} base={base} admin={canManage} refresh={refresh} /></details> : <PaymentHistory account={a} base={base} admin={canManage} refresh={refresh} />}
        </>
        return <article className={`ux-panel billing-account${admin ? ' billing-account-compact' : ''}`} key={a.id} aria-label={a.title}>{admin ? <details className="billing-account-details"><summary><div className="billing-account-identity"><strong>{a.title}</strong><span>{a.kind} · {responsible(a)}{a.dueDate ? ` · ${isOverdue(a) ? 'Vencido em' : 'Vence em'} ${date(a.dueDate)}` : ''}</span><span className="billing-situation">{accountSituation(a)}</span>{lastPayment && <span>Último pagamento: {paymentDate(lastPayment.paidAtUtc)}</span>}</div><div className="billing-account-amounts"><span>Recebido<strong>{money(a.paid)}</strong></span><span>A receber<strong>{money(a.payable)}</strong></span>{a.pending > 0 && <span>Em confirmação<strong>{money(a.pending)}</strong></span>}</div><span className="billing-account-toggle">Ver detalhes</span></summary><div className="billing-account-content">{details}</div></details> : details}</article>
      })}</section>)}
  </main>
}
