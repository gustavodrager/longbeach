import { formatPhone } from '../../lib/inputFormatting'
import { useContext, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ContextLink, EditorPanel, ModalPanel } from '../../components/managementUi'
import { Field, useFilters } from '../../pages/arenaUi'
import { CustomerPicker } from '../customers/CustomerPicker'
import type { CustomerSelection } from '../customers/api'
import { useAuth } from '../auth/authContext'
import { hasPermission } from '../auth/access'
import { MessagingRuntime, conversationLabel, dateTime, messagingCommand, useMessagingAction, useMessagingQuery, useMessagingRefresh, type Conversation, type Page } from './api'
import { ActionNotice, EmptyPanel, Pagination, QueryNotice } from './shared'
import { ConversationContextPanel } from './ConversationContext'
import { MessageComposer, MessageThread } from './Messages'

const filters = [{ value: '', label: 'Todas' }, { value: 'NeedsTeam', label: 'Precisa da equipe' }, { value: 'InProgress', label: 'Em atendimento' }, { value: 'Bot', label: 'Com o bot' }, { value: 'Completed', label: 'Concluídas' }]
function NewConversation({ close }: { close: () => void }) {
  const [customer, setCustomer] = useState<CustomerSelection | null>(null); const [operationId] = useState(() => crypto.randomUUID())
  const action = useMessagingAction(); const refresh = useMessagingRefresh(); const navigate = useNavigate()
  return <EditorPanel title="Nova conversa" onClose={close} busy={action.busy}><form className="whatsapp-dialog-content" onSubmit={event => { event.preventDefault(); if (!customer) return; void action.run(async () => { const result = await messagingCommand<Conversation>('/conversations', { operationId, customerId: customer.id }); await refresh(); close(); navigate(`/whatsapp/conversas/${result.id}`); return result }) }}><p>Escolha um cliente cadastrado. A seleção abre a conversa; a mensagem será revisada antes do envio.</p><CustomerPicker scope="messaging" existingOnly required label="Cliente" value={customer} onChange={setCustomer} disabled={action.busy} contextKey="whatsapp-new" /><ActionNotice action={action} /><button type="submit" className="primary-link" disabled={action.busy || !customer}>Abrir conversa</button></form></EditorPanel>
}

export function Conversations() {
  const { conversationId } = useParams(); const { user } = useAuth(); const view = useFilters(); const [newOpen, setNewOpen] = useState(false)
  const [search, setSearch] = useState(view.query)
  useEffect(() => { const timer = window.setTimeout(() => setSearch(view.query.trim()), 300); return () => window.clearTimeout(timer) }, [view.query])
  const filter = filters.some(item => item.value === view.status) ? view.status : ''
  const page = Math.max(1, Number(view.params.get('page')) || 1)
  const params = new URLSearchParams({ page: String(page), pageSize: '20' }); if (search) params.set('search', search)
  if (filter === 'Bot') params.set('mode', 'Bot'); else if (filter) params.set('status', filter)
  if (filter === 'NeedsTeam') params.set('mode', 'Team')
  const query = useMessagingQuery<Page<Conversation>>(`/conversations?${params}`, 15_000)
  return <div className={`whatsapp-workspace ${conversationId ? 'has-conversation' : ''}`}>
    <section className="whatsapp-conversation-list" aria-label="Conversas"><header><h2>Conversas</h2>{hasPermission(user, 'messaging:operate') && <button className="secondary-link" type="button" onClick={() => setNewOpen(true)}>Nova conversa</button>}</header><Field label="Buscar conversa" value={view.query} placeholder="Nome ou telefone" onChange={value => view.set('q', value)} /><nav className="whatsapp-conversation-filters" aria-label="Filtrar conversas">{filters.map(item => <button type="button" key={item.value} aria-pressed={filter === item.value} onClick={() => view.set('status', item.value)}>{item.label}</button>)}</nav><QueryNotice query={query} label="consultar as conversas" />
      {query.data && <><p className="whatsapp-muted">{query.data.total} {query.data.total === 1 ? 'conversa' : 'conversas'}</p><div className="whatsapp-conversation-rows">{query.data.items.map(conversation => <ContextLink className={`whatsapp-conversation-row ${conversationId === conversation.id ? 'is-selected' : ''}`} key={conversation.id} to={view.href(`/whatsapp/conversas/${conversation.id}`)} aria-current={conversationId === conversation.id ? 'page' : undefined} state={{ returnLabel: 'Conversas' }}><div className="whatsapp-conversation-row-top"><strong>{conversation.name || formatPhone(conversation.phone) || 'Contato não identificado'}</strong>{conversation.unreadCount > 0 && <span className="whatsapp-unread" aria-label={`${conversation.unreadCount} mensagens não lidas pela equipe`}>{conversation.unreadCount}</span>}</div><small>{formatPhone(conversation.phone) || 'Contato sem telefone identificado'}</small>{!conversation.customerId && <span className="status-pill whatsapp-unidentified">Não identificado</span>}<p>{conversation.lastMessage || 'Ainda sem mensagens'}</p><div className="whatsapp-conversation-row-meta"><span>{conversation.mode === 'Bot' && conversation.status !== 'Completed' ? 'Com o bot' : conversationLabel[conversation.status]}</span><time>{dateTime(conversation.lastMessageAtUtc)}</time></div></ContextLink>)}</div>{!query.data.items.length && <p className="whatsapp-notice">Nenhuma conversa nesta seleção.</p>}<Pagination data={query.data} busy={query.isFetching} change={value => view.set('page', String(value))} /></>}
    </section>
    {conversationId ? <ConversationDetail key={conversationId} id={conversationId} backHref={view.href('/whatsapp')} /> : <EmptyPanel title="Escolha uma conversa">Acompanhe as mensagens, responda e consulte as atividades do contato.</EmptyPanel>}
    {newOpen && <NewConversation close={() => setNewOpen(false)} />}
  </div>
}

function ConversationDetail({ id, backHref }: { id: string; backHref: string }) {
  const { user } = useAuth(); const environment = useContext(MessagingRuntime)
  const query = useMessagingQuery<Conversation>(`/conversations/${id}`, 5_000); const action = useMessagingAction(); const refresh = useMessagingRefresh()
  const [wide, setWide] = useState(() => window.innerWidth >= 1440)
  const [contextOpen, setContextOpen] = useState(wide); const readBusy = useRef(false); const seenVersion = useRef(-1)
  useEffect(() => {
    const resized = () => { const next = window.innerWidth >= 1440; if (next !== wide) { setWide(next); if (!next) setContextOpen(false) } }
    window.addEventListener('resize', resized)
    return () => window.removeEventListener('resize', resized)
  }, [wide])
  const conversation = query.data; const operate = hasPermission(user, 'messaging:operate')
  const assignedElsewhere = conversation?.status === 'InProgress' && Boolean(conversation.assignedUserId) && conversation.assignedUserId !== user?.id
  const assignmentBlocked = assignedElsewhere && !hasPermission(user, 'messaging:manage')
  async function command(name: string) {
    if (!conversation) return
    if (assignmentBlocked) { action.setError('Outro atendente assumiu esta conversa. Aguarde a liberação ou peça ajuda à gestão.'); return }
    await action.run(async () => { const result = await messagingCommand<Conversation>(`/conversations/${id}/${name}`, { operationId: crypto.randomUUID(), expectedVersion: conversation.version }); await refresh(); return result }, name === 'resume-bot' ? 'Bot retomado nesta conversa.' : name === 'complete' ? 'Conversa concluída.' : 'Conversa assumida pela equipe.')
  }
  async function seen() {
    if (!conversation || !operate || !environment.visible || !environment.online || !conversation.unreadCount || readBusy.current || seenVersion.current === conversation.version) return
    readBusy.current = true
    try { const result = await messagingCommand<Conversation>(`/conversations/${id}/read`, { operationId: crypto.randomUUID(), expectedVersion: conversation.version }); seenVersion.current = result.version; await refresh() }
    catch { /* The next visible update can retry the read marker without disturbing the reply. */ }
    finally { readBusy.current = false }
  }
  return <div className={`whatsapp-conversation-detail ${contextOpen ? 'with-context' : ''}`}>
    <section className="whatsapp-chat" aria-label="Conversa selecionada"><header className="whatsapp-chat-header"><Link className="whatsapp-back" to={backHref}>← Conversas</Link><div><h2>{conversation?.name || 'Conversa'}</h2>{conversation && !conversation.customerId && <span className="status-pill whatsapp-unidentified">Não identificado</span>}{conversation && <p>{formatPhone(conversation.phone) || 'Telefone não identificado'} · {conversation.mode === 'Bot' && conversation.status !== 'Completed' ? 'Com o bot' : conversationLabel[conversation.status]}</p>}{conversation && <small>{conversation.mode === 'Bot' ? 'Modo automático' : conversation.assignedUserName ? `Assumida por ${conversation.assignedUserName}` : 'Com a equipe · sem responsável'}</small>}</div>{conversation && <button type="button" className="text-button" aria-expanded={contextOpen} onClick={() => setContextOpen(value => !value)}>{contextOpen ? 'Ocultar contexto' : 'Ver contexto'}</button>}</header>
      <QueryNotice query={query} label="abrir a conversa" /><ActionNotice action={action} />
      {conversation && <><div className="whatsapp-chat-actions">{operate && <><button type="button" className="secondary-link" disabled={action.busy || !environment.online || assignmentBlocked || conversation.assignedUserId === user?.id && conversation.mode === 'Team' && conversation.status === 'InProgress'} onClick={() => void command('assume')}>Assumir conversa</button><button type="button" className="secondary-link" disabled={action.busy || !environment.online || assignmentBlocked || conversation.mode === 'Bot'} onClick={() => void command('resume-bot')}>Devolver ao bot</button><button type="button" className="text-button" disabled={action.busy || !environment.online || assignmentBlocked || conversation.status === 'Completed'} onClick={() => void command('complete')}>Concluir</button></>}</div><MessageThread conversationId={id} onSeen={() => void seen()} /><MessageComposer key={`${user?.id}:${id}`} conversationId={id} blockedBy={conversation.status === 'InProgress' && conversation.assignedUserId && conversation.assignedUserId !== user?.id ? conversation.assignedUserName || 'outro atendente' : null} onSent={() => { void query.refetch() }} /></>}
    </section>
    {conversation && contextOpen && (wide ? <ConversationContextPanel conversation={conversation} close={() => setContextOpen(false)} /> : <ModalPanel title="Contato e atividades" className="whatsapp-context-dialog" onClose={() => setContextOpen(false)}><ConversationContextPanel conversation={conversation} close={() => setContextOpen(false)} /></ModalPanel>)}
  </div>
}
