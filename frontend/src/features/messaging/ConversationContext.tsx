import { useState } from 'react'
import { ContextLink, EditorPanel, ModalPanel } from '../../components/managementUi'
import { CustomerPicker } from '../customers/CustomerPicker'
import type { CustomerSelection } from '../customers/api'
import { useAuth } from '../auth/authContext'
import { hasPermission } from '../auth/access'
import { activityDate, messagingCommand, money, useMessagingAction, useMessagingQuery, useMessagingRefresh, type Activity, type Conversation, type ConversationContext as Context, type Message } from './api'
import { ActionNotice, QueryNotice } from './shared'

function IdentityEditor({ conversation, close }: { conversation: Conversation; close: () => void }) {
  const [customer, setCustomer] = useState<CustomerSelection | null>(conversation.customerId ? { id: conversation.customerId, name: conversation.name } : null)
  const [verified, setVerified] = useState(conversation.identityVerified); const [consent, setConsent] = useState(conversation.consentForReminders)
  const [operationId] = useState(() => crypto.randomUUID()); const [expectedVersion] = useState(conversation.version); const action = useMessagingAction(); const refresh = useMessagingRefresh()
  return <EditorPanel title="Identificar contato" busy={action.busy} onClose={close}><form className="whatsapp-dialog-content" onSubmit={event => { event.preventDefault(); void action.run(async () => {
    const result = await messagingCommand<Conversation>(`/conversations/${conversation.id}/contact`, { operationId, expectedVersion, customerId: customer?.id ?? null, identityVerified: verified, consentForReminders: consent }, 'PUT')
    await refresh(); close(); return result
  }) }}><p>Confira a pessoa que usa este WhatsApp antes de liberar informações pessoais. O telefone pode ser compartilhado.</p><CustomerPicker scope="messaging" existingOnly contextKey={`whatsapp-identity:${conversation.id}`} label="Cliente do contato" value={customer} onChange={person => { setCustomer(person); setVerified(false); setConsent(false) }} disabled={action.busy} /><label className="whatsapp-check"><input type="checkbox" checked={verified} disabled={!customer || action.busy} onChange={event => { setVerified(event.target.checked); if (!event.target.checked) setConsent(false) }} />Identidade conferida pela equipe</label><label className="whatsapp-check"><input type="checkbox" checked={consent} disabled={!verified || action.busy} onChange={event => setConsent(event.target.checked)} />Cliente autorizou receber lembretes pelo WhatsApp</label><p>Identificação, acesso às contas e responsável financeiro são conferidos separadamente.</p><ActionNotice action={action} /><button className="primary-link" type="submit" disabled={action.busy}>Salvar identificação</button></form></EditorPanel>
}

export function ConversationContextPanel({ conversation, close }: { conversation: Conversation; close: () => void }) {
  const { user } = useAuth(); const manageable = hasPermission(user, 'messaging:manage'); const operate = hasPermission(user, 'messaging:operate')
  const query = useMessagingQuery<Context>(`/conversations/${conversation.id}/context`, 15_000)
  const action = useMessagingAction(); const refresh = useMessagingRefresh(); const [identityOpen, setIdentityOpen] = useState(false)
  const [confirmation, setConfirmation] = useState<{ activity: Activity; status: 'Going' | 'NotGoing'; operationId: string } | null>(null)
  const [statement, setStatement] = useState<{ account: Context['barAccounts'][number]; operationId: string } | null>(null)
  const context = query.data
  async function confirmAttendance() {
    if (!confirmation) return
    const { activity, status, operationId } = confirmation
    const result = await action.run(() => messagingCommand<Activity>(`/conversations/${conversation.id}/confirmations`, { operationId, kind: activity.kind, activityId: activity.id, subjectId: activity.subjectId, date: activity.date, status, expectedVersion: activity.version }), 'Confirmação atualizada.')
    if (result) { setConfirmation(null); await refresh() }
  }
  async function sendStatement() {
    if (!statement) return
    const result = await action.run(() => messagingCommand<Message>(`/conversations/${conversation.id}/bar-statement`, { operationId: statement.operationId, accountId: statement.account.id }), 'Conta adicionada à fila de envio.')
    if (result) { setStatement(null); await refresh() }
  }
  return <aside className="whatsapp-context" aria-label="Contexto do contato"><header><h2>Contato e atividades</h2><button className="text-button" type="button" onClick={close} aria-label="Fechar contexto">Fechar</button></header><QueryNotice query={query} label="consultar o contexto do contato" /><ActionNotice action={action} />
    <section><h3>{context?.customerName ?? conversation.name}</h3><p>{conversation.phone || 'Telefone ainda não identificado'}</p><span className={`status-pill ${conversation.identityVerified ? '' : 'arena-warning'}`}>{conversation.identityVerified ? 'Identidade conferida' : 'Identidade pendente'}</span>{context?.profiles.length ? <div className="customer-tags">{context.profiles.map(profile => <span className="status-pill" key={profile}>{profile}</span>)}</div> : null}<p className="whatsapp-muted">{conversation.consentForReminders ? 'Lembretes autorizados pelo contato' : 'Lembretes sem autorização do contato'}</p>{conversation.customerId && hasPermission(user, 'customers:read') && <ContextLink to={`/clientes/${conversation.customerId}`} state={{ returnLabel: 'Conversa no WhatsApp' }}>Abrir ficha do cliente →</ContextLink>}{manageable && <button className="secondary-link" type="button" onClick={() => setIdentityOpen(true)}>Identificar contato</button>}</section>
    {!conversation.identityVerified && <p className="whatsapp-notice">A equipe pode responder esta conversa. As informações pessoais dependem de identificação conferida.</p>}
    {context?.identityVerified && <><section><h3>Próximas atividades</h3>{context.activities.length ? context.activities.map(activity => <article className="whatsapp-context-activity" key={`${activity.kind}:${activity.id}:${activity.subjectId}:${activity.date}`}><strong>{activity.label}</strong><span>{activity.subjectName}</span><span>{activityDate(activity.date)} · {activity.startTime}–{activity.endTime}</span><small>{activity.court}</small><span className="status-pill">{activity.confirmation === 'Going' ? 'Vai participar' : activity.confirmation === 'NotGoing' ? 'Não vai participar' : 'Aguardando confirmação'}</span>{operate && <div className="whatsapp-inline-actions">{(['Going', 'NotGoing'] as const).map(status => <button className="secondary-link" type="button" key={status} disabled={action.busy || activity.confirmation === status} onClick={() => setConfirmation({ activity, status, operationId: crypto.randomUUID() })}>{status === 'Going' ? 'Vai participar' : 'Não vai participar'}</button>)}</div>}</article>) : <p>Nenhuma atividade disponível para este contato.</p>}<p className="whatsapp-muted">Confirmação antecipada. A presença na arena continua registrada pela equipe.</p></section>
      {context.canViewBar && <section><h3>Contas do Bar</h3>{context.barAccounts.length ? context.barAccounts.map(account => <article key={account.id} className="whatsapp-context-activity"><strong>{account.label}</strong><span>Saldo em aberto: {money(account.balance)}</span>{(account.pending ?? 0) > 0 && <small>Em confirmação: {money(account.pending!)}</small>}{account.detailsUrl.startsWith('/') && !account.detailsUrl.startsWith('//') && <ContextLink to={account.detailsUrl} state={{ returnLabel: 'Conversa no WhatsApp' }}>Abrir conta →</ContextLink>}{operate && hasPermission(user, 'bar:sales:read') && <button className="secondary-link" type="button" disabled={action.busy} onClick={() => setStatement({ account, operationId: crypto.randomUUID() })}>Enviar conta</button>}</article>) : <p>Nenhuma conta disponível para envio.</p>}</section>}
    </>}
    {identityOpen && <IdentityEditor conversation={conversation} close={() => setIdentityOpen(false)} />}
    {confirmation && <ModalPanel title="Conferir confirmação" onClose={() => { if (!action.busy) setConfirmation(null) }}><div className="whatsapp-dialog-content"><p>{confirmation.activity.subjectName} · {confirmation.activity.label}</p><p>{activityDate(confirmation.activity.date)} · {confirmation.activity.startTime}–{confirmation.activity.endTime}</p><p>Registrar: <strong>{confirmation.status === 'Going' ? 'Vai participar' : 'Não vai participar'}</strong>.</p><ActionNotice action={action} /><button type="button" className="primary-link" disabled={action.busy} onClick={() => void confirmAttendance()}>Confirmar resposta</button></div></ModalPanel>}
    {statement && <ModalPanel title="Conferir envio da conta" onClose={() => { if (!action.busy) setStatement(null) }}><div className="whatsapp-dialog-content"><p>Enviar <strong>{statement.account.label}</strong> para {conversation.name}?</p><p>Saldo em aberto: {money(statement.account.balance)}. A conta será atualizada e conferida novamente ao enviar.</p>{(statement.account.pending ?? 0) > 0 && <p>Em confirmação: {money(statement.account.pending!)}.</p>}<ActionNotice action={action} /><button type="button" className="primary-link" disabled={action.busy} onClick={() => void sendStatement()}>Confirmar envio da conta</button></div></ModalPanel>}
  </aside>
}
