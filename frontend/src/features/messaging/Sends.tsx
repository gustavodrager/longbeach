import { ContextLink } from '../../components/managementUi'
import { Field, useFilters } from '../../pages/arenaUi'
import { dateTime, stateLabel, useMessagingQuery, type Message, type MessageState, type Page } from './api'
import { MessageRecovery } from './Messages'
import { MessageStatus, Pagination, QueryNotice } from './shared'

const purposes: Record<string, string> = { Manual: 'Equipe', ClassReminder: 'Lembrete de aula', RentalReminder: 'Lembrete de mensalista', BarStatement: 'Conta do Bar', Faq: 'Resposta automática', ConfirmationRequest: 'Pedido de confirmação', Handoff: 'Encaminhamento para a equipe' }
export function Sends() {
  const filters = useFilters(); const state = filters.params.get('state') ?? ''; const page = Math.max(1, Number(filters.params.get('page')) || 1)
  const params = new URLSearchParams({ page: String(page), pageSize: '20' }); if (state in stateLabel) params.set('state', state)
  const query = useMessagingQuery<Page<Message>>(`/sends?${params}`, 30_000)
  return <section className="whatsapp-sends" aria-label="Acompanhamento dos envios"><div className="whatsapp-section-heading"><div><h2>Envios</h2><p>Mensagens da equipe, respostas automáticas e lembretes.</p></div><Field label="Situação do envio" value={state} onChange={value => filters.set('state', value)} options={[{ value: '', label: 'Todas' }, ...Object.entries(stateLabel).filter(([key]) => key !== 'Received').map(([value, label]) => ({ value, label }))]} /></div><QueryNotice query={query} label="consultar os envios" />
    {query.data && <><p className="whatsapp-muted">{query.data.total} {query.data.total === 1 ? 'envio' : 'envios'}</p><div className="whatsapp-send-list">{query.data.items.map(message => <article key={message.id} className="whatsapp-send-row"><div><header><strong>{message.purpose === 'Manual' && message.origin === 'Bot' ? 'Resposta automática' : purposes[message.purpose] ?? 'Mensagem'}</strong><MessageStatus state={message.state as MessageState} /></header><p className="whatsapp-send-recipient">Para <strong>{message.conversationName || 'Contato da conversa'}</strong>{message.recipientPhone ? ` · ${message.recipientPhone}` : ''}</p><p className="whatsapp-preserve-lines">{message.text || message.attachment?.fileName || 'Mensagem com anexo'}</p><small>{message.scheduledAtUtc ? `Agendada para ${dateTime(message.scheduledAtUtc)}` : dateTime(message.occurredAtUtc)}{message.authorName ? ` · ${message.authorName}` : ''}</small>{message.failureReason && <p className="whatsapp-failure">{message.failureReason}</p>}<ContextLink to={`/whatsapp/conversas/${message.conversationId}`} state={{ returnLabel: 'Envios do WhatsApp' }}>Abrir conversa →</ContextLink></div><MessageRecovery message={message} /></article>)}</div>{!query.data.items.length && <p className="whatsapp-notice">Nenhum envio nesta seleção.</p>}<Pagination data={query.data} busy={query.isFetching} change={value => filters.set('page', String(value))} /></>}
    <p className="whatsapp-muted">A ausência de confirmação de leitura não significa falha. Ela depende das configurações do contato. As marcações de não lida pela equipe são internas à central.</p>
  </section>
}
