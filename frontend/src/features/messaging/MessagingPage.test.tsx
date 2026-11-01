import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { OptionalUnsavedProvider } from '../../components/managementUi'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import type { AuthUser } from '../auth/types'
import { MessagingPage } from './MessagingPage'
import { MessageAttachment, MessageComposer, MessageThread } from './Messages'
import { MessagingRuntime, messagingSession, type Attachment, type Conversation, type ConversationContext, type Message, type SendInput } from './api'
import { readDraft, saveDraft } from './drafts'

const actor: AuthUser = { id: 'operator-fixture', name: 'Equipe teste', email: 'operator@example.invalid', roles: ['Operations'], permissions: ['messaging:read', 'messaging:operate', 'bar:sales:read'] }
const manager: AuthUser = { ...actor, id: 'manager-fixture', roles: ['Manager'], permissions: [] }
const conversation: Conversation = { id: 'conversation-one', externalId: 'contact@lid', phone: null, name: 'Contato de teste', customerId: null, identityVerified: false, consentForReminders: false, status: 'NeedsTeam', mode: 'Team', assignedUserId: null, assignedUserName: null, unreadCount: 0, lastMessage: 'Quero confirmar minha aula', lastMessageAtUtc: '2026-10-31T18:00:00Z', version: 1 }
const other: Conversation = { ...conversation, id: 'conversation-two', name: 'Outro contato', externalId: 'other@lid' }
const message: Message = { id: 'message-one', conversationId: conversation.id, direction: 'Inbound', origin: 'Customer', text: 'Mensagem de teste', occurredAtUtc: '2026-10-31T18:00:00Z', state: 'Received', authorName: null, attachment: null, operationId: null, purpose: 'Manual', scheduledAtUtc: null, failureReason: null, contextKind: null, contextId: null, contextDate: null }
const context: ConversationContext = { customerId: null, customerName: null, profiles: [], identityVerified: false, consentForReminders: false, activities: [], barAccounts: [], canViewBar: false }
const clients: QueryClient[] = []; const routers: ReturnType<typeof createMemoryRouter>[] = []
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }) }
function fixtures() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const path = new URL(String(url), 'http://test').pathname
    if (path.endsWith('/connection')) return json({ state: 'Connected', detail: null })
    if (path.endsWith('/settings')) return json({ botEnabled: false, classRemindersEnabled: true, rentalRemindersEnabled: false, reminderTime: '18:00', version: 1 })
    if (path.endsWith('/capabilities')) return json({ aiConfigured: false, dispatchEnabled: true })
    if (path.endsWith('/faqs')) return json([])
    if (path.endsWith('/context')) return json(context)
    if (path.endsWith('/messages')) return json({ items: [message], before: null, hasMore: false })
    if (path.endsWith('/conversations') && !init?.method) return json({ items: [conversation, other], total: 2, page: 1, pageSize: 20 })
    if (path.endsWith('/conversations/conversation-one')) return json(conversation)
    if (path.endsWith('/conversations/conversation-two')) return json(other)
    return json({ ...conversation, version: 2, status: 'InProgress', assignedUserId: actor.id, assignedUserName: actor.name })
  })
}
function mount(path = '/whatsapp/conversas/conversation-one', user = actor, element = <MessagingPage />) {
  let changeActor: (next: AuthUser) => void = () => {}
  function Session() {
    const [current, setCurrent] = useState(user); changeActor = setCurrent
    return <AuthContext.Provider value={{ user: current, signOut: async () => {} } as AuthContextValue}><OptionalUnsavedProvider><Outlet /></OptionalUnsavedProvider></AuthContext.Provider>
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client)
  const router = createMemoryRouter([{ element: <Session />, children: [{ path: '/whatsapp/*', element }] }], { initialEntries: [path] }); routers.push(router)
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
  return { router, client, actor: (next: AuthUser) => act(() => changeActor(next)) }
}
beforeEach(() => {
  onlineManager.setOnline(true); focusManager.setFocused(true)
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true }); Object.defineProperty(document, 'hidden', { value: false, configurable: true })
  window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange'))
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); routers.splice(0).forEach(router => router.dispose()); sessionStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); Object.defineProperty(navigator, 'onLine', { value: true, configurable: true }); Object.defineProperty(document, 'hidden', { value: false, configurable: true }) })

it('abre uma conversa real do OS e mantém contato não identificado sem liberar atividades privadas', async () => {
  const fetch = fixtures(); mount()
  expect(await screen.findByText(message.text)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Assumir conversa' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: 'Gerenciar conexão' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Ver contexto' }))
  expect(await screen.findByText('Identidade pendente')).toBeVisible()
  expect(screen.getByText(/As informações pessoais dependem de identificação conferida/)).toBeVisible()
  expect(screen.queryByText('Contas do Bar')).not.toBeInTheDocument()
  expect(fetch.mock.calls.every(([, init]) => !init?.method)).toBe(true)
})

it('identifica contato recebido ao vivo sem cadastro na lista e no cabeçalho mantendo o telefone', async () => {
  let arrived = false
  const incoming = { ...conversation, id: 'unknown-live', name: '5511999998888', phone: '5511999998888', customerId: null }
  const fetch = fixtures(); const original = fetch.getMockImplementation()!
  fetch.mockImplementation(async (url, init) => {
    const path = new URL(String(url), 'http://test').pathname
    if (path.endsWith('/conversations')) return json({ items: arrived ? [incoming] : [], total: arrived ? 1 : 0, page: 1, pageSize: 20 })
    if (path.endsWith('/conversations/unknown-live')) return json(incoming)
    if (path.endsWith('/conversations/unknown-live/messages')) return json({ items: [], before: null, hasMore: false })
    return original(url, init)
  })
  const { client } = mount('/whatsapp')
  await screen.findByText('Nenhuma conversa nesta seleção.')
  arrived = true
  await act(() => client.invalidateQueries({ queryKey: ['messaging', messagingSession(actor)] }))
  const row = await screen.findByRole('link', { name: /5511999998888.*Não identificado/ })
  expect(within(row).getByText('Não identificado')).toBeVisible()
  expect(row).toHaveTextContent(incoming.phone)
  fireEvent.click(row)
  expect(await screen.findByRole('heading', { name: incoming.phone })).toBeVisible()
  expect(within(screen.getByRole('region', { name: 'Conversa selecionada' })).getByText('Não identificado')).toBeVisible()
  expect(screen.getByRole('region', { name: 'Conversa selecionada' })).toHaveTextContent(incoming.phone)
})

it('busca e filtra conversas na API e preserva o filtro ao abrir a conversa', async () => {
  const fetch = fixtures(); const { router } = mount('/whatsapp')
  fireEvent.click(await screen.findByRole('button', { name: 'Com o bot' }))
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).includes('mode=Bot'))).toBe(true))
  fireEvent.click(screen.getByRole('link', { name: /Outro contato/ }))
  expect(router.state.location.pathname).toBe('/whatsapp/conversas/conversation-two')
  expect(router.state.location.search).toBe('?status=Bot')
})

it('preserva rascunhos por conversa e nunca os apresenta a outro usuário', async () => {
  fixtures(); const session = mount()
  const input = await screen.findByLabelText('Mensagem')
  fireEvent.change(input, { target: { value: 'Rascunho reservado à primeira conversa' } })
  fireEvent.click(screen.getByRole('link', { name: /Outro contato/ }))
  expect(await screen.findByLabelText('Mensagem')).toHaveValue('')
  fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Segundo rascunho' } })
  fireEvent.click(screen.getByRole('link', { name: /Contato de teste/ }))
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toHaveValue('Rascunho reservado à primeira conversa'))
  session.actor({ ...actor, id: 'other-operator' })
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toHaveValue(''))
  expect(readDraft(actor.id, conversation.id).text).toBe('Rascunho reservado à primeira conversa')
})

it('faz conferência por GET após timeout e só repete a mesma operação preservada quando ela ainda não foi localizada', async () => {
  const requests: SendInput[] = []; let recorded = false
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (init?.method === 'POST') { requests.push(JSON.parse(String(init.body))); if (!recorded) { recorded = true; throw new TypeError('Conexão interrompida') }; return json({ ...message, direction: 'Outbound', state: 'Queued', operationId: requests.at(-1)!.operationId }) }
    if (String(url).includes('/operations/')) return json({ message: 'Operação não localizada' }, 404)
    return json({})
  })
  mount('/whatsapp', actor, <MessageComposer conversationId={conversation.id} onSent={() => {}} />)
  fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Resposta que não pode duplicar' } })
  fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }))
  expect(await screen.findByRole('button', { name: 'Conferir mesma operação' })).toBeInTheDocument()
  expect(screen.getByLabelText('Mensagem')).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Conferir mesma operação' }))
  expect(await screen.findByRole('button', { name: 'Repetir mesma operação' })).toBeEnabled()
  expect(requests).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Repetir mesma operação' }))
  await waitFor(() => expect(requests).toHaveLength(2))
  expect(requests[1]).toEqual(requests[0])
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toHaveValue(''))
  expect(fetch.mock.calls.some(([url, init]) => String(url).includes('/operations/') && !init?.method)).toBe(true)
})

it('não reenvia mensagem com resultado incerto e conserva checkpoint ao remontar', async () => {
  const body = { operationId: 'operation-fixture', text: 'Mensagem pendente', purpose: 'Manual' }; saveDraft(actor.id, conversation.id, { text: body.text, pending: body })
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ...message, state: 'Uncertain', operationId: body.operationId }))
  mount('/whatsapp', actor, <MessageComposer conversationId={conversation.id} onSent={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Conferir mesma operação' }))
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  expect(screen.queryByRole('button', { name: 'Repetir mesma operação' })).not.toBeInTheDocument()
  expect(screen.getByLabelText('Mensagem')).toHaveValue(body.text)
  expect(screen.getByLabelText('Mensagem')).toBeDisabled()
  expect(fetch.mock.calls[0][1]?.method).toBeUndefined()
})

it('marca a intervenção da equipe com versão conferida e não muda a conversa otimisticamente', async () => {
  const fetch = fixtures(); mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Assumir conversa' }))
  await waitFor(() => expect(fetch.mock.calls.some(([url, init]) => String(url).endsWith('/assume') && JSON.parse(String(init?.body)).expectedVersion === 1)).toBe(true))
  expect(await screen.findByText('Conversa assumida pela equipe.')).toBeVisible()
})

it('só oferece identificação, configuração e conexão para a gestão, sem criar clientes dentro da nova conversa', async () => {
  fixtures(); mount('/whatsapp', manager)
  fireEvent.click(await screen.findByRole('button', { name: 'Nova conversa' }))
  const dialog = within(screen.getByRole('dialog', { name: 'Nova conversa' }))
  expect(dialog.queryByRole('button', { name: '+ Cadastrar cliente' })).not.toBeInTheDocument()
  expect(dialog.getByRole('button', { name: 'Abrir conversa' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Gerenciar conexão' })).toBeInTheDocument()
})

it('envia JPG/PNG/PDF só após upload e impede tipos e tamanhos inadequados', async () => {
  const attachment: Attachment = { id: 'attachment-one', fileName: 'conta.pdf', contentType: 'application/pdf', length: 10, url: '/api/v1/messaging/attachments/attachment-one' }; const posts: { url: string; body: unknown }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => { posts.push({ url: String(url), body: init?.body }); return String(url).endsWith('/attachments') ? json(attachment) : json({ ...message, direction: 'Outbound', state: 'Queued', attachment }) })
  mount('/whatsapp', actor, <MessageComposer conversationId={conversation.id} onSent={() => {}} />)
  fireEvent.change(screen.getByLabelText('Anexar imagem ou PDF'), { target: { files: [new File(['audio'], 'audio.ogg', { type: 'audio/ogg' })] } })
  expect(await screen.findByText('Escolha uma imagem JPG/PNG ou um PDF de até 10 MB.')).toBeVisible(); expect(posts).toHaveLength(0)
  fireEvent.change(screen.getByLabelText('Anexar imagem ou PDF'), { target: { files: [new File(['pdf'], 'conta.pdf', { type: 'application/pdf' })] } })
  await screen.findByText('conta.pdf')
  expect(posts[0].body).toBeInstanceOf(FormData)
  fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }))
  await waitFor(() => expect(posts).toHaveLength(2))
  expect(JSON.parse(String(posts[1].body))).toMatchObject({ attachmentId: attachment.id, text: '' })
})

it('abre mídia privada pela API autenticada e revoga o endereço local quando sai da conversa', async () => {
  const attachment: Attachment = { id: 'private-media', fileName: 'audio.ogg', contentType: 'audio/ogg', length: 5, url: 'https://external.example/never-use' }
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Blob(['audio'], { type: 'audio/ogg' }), { status: 200 }))
  const create = vi.fn(() => 'blob:private-media'); const revoke = vi.fn(); Object.defineProperty(URL, 'createObjectURL', { value: create, configurable: true }); Object.defineProperty(URL, 'revokeObjectURL', { value: revoke, configurable: true })
  mount('/whatsapp', actor, <MessageAttachment attachment={attachment} />)
  fireEvent.click(screen.getByRole('button', { name: /Ouvir áudio/ }))
  expect(await screen.findByLabelText('Áudio: audio.ogg')).toHaveAttribute('src', 'blob:private-media')
  expect(fetch.mock.calls[0][0]).toBe('/api/v1/messaging/attachments/private-media')
  expect(fetch.mock.calls[0][1]?.credentials).toBe('include')
  cleanup(); expect(revoke).toHaveBeenCalledWith('blob:private-media')
})

it('preserva a posição de leitura e mostra aviso quando chegam novas mensagens', async () => {
  let items = [message]
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ items, before: null, hasMore: false }))
  const { client } = mount('/whatsapp', actor, <MessageThread conversationId={conversation.id} onSeen={() => {}} />)
  await screen.findByText(message.text)
  const history = screen.getByRole('region', { name: 'Histórico da conversa' })
  Object.defineProperties(history, { scrollHeight: { value: 1000, configurable: true }, clientHeight: { value: 300, configurable: true } }); history.scrollTop = 100; fireEvent.scroll(history)
  items = [message, { ...message, id: 'new-message', text: 'Mensagem nova', occurredAtUtc: '2026-10-31T18:01:00Z' }]
  await act(() => client.invalidateQueries({ queryKey: ['messaging', messagingSession(actor)] }))
  expect(await screen.findByRole('button', { name: 'Novas mensagens (1) ↓' })).toBeVisible()
  expect(history.scrollTop).toBe(100)
  fireEvent.click(screen.getByRole('button', { name: 'Novas mensagens (1) ↓' }))
  expect(history.scrollTop).toBe(1000)
})

it('suspende consultas periódicas com a aba oculta e preserva rascunho sem liberar envio offline', async () => {
  const fetch = fixtures(); mount()
  const input = await screen.findByLabelText('Mensagem'); fireEvent.change(input, { target: { value: 'Rascunho offline' } })
  Object.defineProperty(document, 'hidden', { value: true, configurable: true }); fireEvent(document, new Event('visibilitychange'))
  const calls = fetch.mock.calls.length
  vi.useFakeTimers(); await act(async () => { await vi.advanceTimersByTimeAsync(31_000) })
  expect(fetch.mock.calls.length).toBe(calls)
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true }); fireEvent(window, new Event('offline'))
  expect(screen.getByRole('button', { name: 'Enviar mensagem' })).toBeDisabled()
  expect(input).toHaveValue('Rascunho offline')
})

it('não consulta a central quando a conta não tem permissão', () => {
  const fetch = vi.spyOn(globalThis, 'fetch')
  mount('/whatsapp', { ...actor, permissions: [] })
  expect(screen.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible()
  expect(fetch).not.toHaveBeenCalled()
})

it('reabre o agendamento recolhido quando a data obrigatória precisa ser preenchida', () => {
  mount('/whatsapp', actor, <MessageComposer conversationId={conversation.id} onSent={() => {}} />)
  const summary = screen.getByText('Agendar envio individual', { selector: 'summary' })
  fireEvent.click(summary); fireEvent.click(screen.getByLabelText('Enviar em data e hora'))
  const date = screen.getByLabelText('Agendar para (horário de São Paulo)')
  fireEvent.click(summary)
  expect(summary.closest('details')).not.toHaveAttribute('open')
  fireEvent.invalid(date)
  expect(summary.closest('details')).toHaveAttribute('open')
  expect(date).toBeVisible()
})

it('explica a fila quando os envios estão desativados e distingue saldo do Bar de valor em confirmação', async () => {
  const fetch = fixtures(); const original = fetch.getMockImplementation()!; const sends: SendInput[] = []
  fetch.mockImplementation(async (url, init) => {
    if (String(url).endsWith('/capabilities')) return json({ aiConfigured: false, dispatchEnabled: false })
    if (String(url).endsWith('/conversations/conversation-one')) return json({ ...conversation, identityVerified: true })
    if (String(url).endsWith('/context')) return json({ ...context, identityVerified: true, canViewBar: true, barAccounts: [{ id: 'account-fixture', label: 'Comanda de teste', balance: 50, pending: 20, availableToPay: 30, detailsUrl: '/atendimento/comandas/account-fixture' }] })
    if (String(url).endsWith('/messages') && init?.method === 'POST') { const body = JSON.parse(String(init.body)); sends.push(body); return json({ ...message, direction: 'Outbound', state: 'Queued', operationId: body.operationId }) }
    return original(url, init)
  })
  mount()
  const button = await screen.findByRole('button', { name: 'Colocar na fila' })
  expect(screen.getAllByText('Envios aguardam a conexão ser ativada. Mensagens colocadas na fila serão enviadas quando ela voltar.')).toHaveLength(2)
  fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Mensagem para a fila' } })
  fireEvent.click(button)
  await waitFor(() => expect(sends).toHaveLength(1))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Ver contexto' }))
  expect(await screen.findByText(/Saldo em aberto: R\$\s*50,00/)).toBeVisible()
  expect(screen.getByText(/Em confirmação: R\$\s*20,00/)).toBeVisible()
})

it('protege o rascunho de B enquanto A atende e libera o compositor quando o atendimento é liberado', async () => {
  let owned = true
  saveDraft(actor.id, conversation.id, { text: 'Rascunho do atendente B' })
  const fetch = fixtures(); const original = fetch.getMockImplementation()!
  fetch.mockImplementation(async (url, init) => {
    if (String(url).endsWith('/conversations/conversation-one')) return json({ ...conversation, status: owned ? 'InProgress' : 'NeedsTeam', assignedUserId: owned ? 'operator-a' : null, assignedUserName: owned ? 'Atendente A' : null })
    return original(url, init)
  })
  const { client } = mount()
  const input = await screen.findByLabelText('Mensagem')
  expect(input).toHaveValue('Rascunho do atendente B')
  expect(input).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Enviar mensagem' })).toBeDisabled()
  expect(screen.getByLabelText('Anexar imagem ou PDF')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Assumir conversa' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Devolver ao bot' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Concluir' })).toBeDisabled()
  expect(screen.getByText(/Esta conversa foi assumida por Atendente A/)).toBeVisible()
  expect(fetch.mock.calls.every(([, init]) => !init?.method)).toBe(true)
  owned = false
  await act(() => client.invalidateQueries({ queryKey: ['messaging', messagingSession(actor)] }))
  await waitFor(() => expect(input).toBeEnabled())
  expect(input).toHaveValue('Rascunho do atendente B')
  expect(screen.getByRole('button', { name: 'Enviar mensagem' })).toBeEnabled()
})

it('gestor pode reatribuir explicitamente outra conversa antes de enviar', async () => {
  const fetch = fixtures(); const original = fetch.getMockImplementation()!
  fetch.mockImplementation(async (url, init) => {
    if (String(url).endsWith('/conversations/conversation-one')) return json({ ...conversation, status: 'InProgress', assignedUserId: 'operator-a', assignedUserName: 'Atendente A' })
    return original(url, init)
  })
  mount('/whatsapp/conversas/conversation-one', manager)
  expect(await screen.findByLabelText('Mensagem')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Assumir conversa' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Devolver ao bot' })).toBeEnabled()
})

it('pendências da equipe excluem conversas ativas com o bot em ambas as listas', async () => {
  const fetch = fixtures(); const { router } = mount('/whatsapp')
  fireEvent.click(await screen.findByRole('button', { name: 'Precisa da equipe' }))
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).includes('status=NeedsTeam') && String(url).includes('mode=Team'))).toBe(true))
  await act(() => router.navigate('/whatsapp/automacao'))
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).includes('status=NeedsTeam&mode=Team&page=1&pageSize=20'))).toBe(true))
})

it.each([403, 404, 409])('rejeição definitiva %s preserva texto, anexo e agendamento sem prender o rascunho à operação recusada', async status => {
  const attachment: Attachment = { id: 'attachment-fixture', fileName: 'conta.pdf', contentType: 'application/pdf', length: 10, url: '/api/v1/messaging/attachments/attachment-fixture' }
  saveDraft(actor.id, conversation.id, { text: 'Texto para revisar', attachment, scheduleEnabled: true, scheduledAtLocal: '2030-01-05T18:30' })
  const requests: SendInput[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => { requests.push(JSON.parse(String(init?.body))); return json({ message: 'Envio recusado para esta conversa.' }, status) })
  mount('/whatsapp', actor, <MessageComposer conversationId={conversation.id} onSent={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Agendar mensagem' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('O rascunho foi preservado para revisão.')
  expect(screen.getByLabelText('Mensagem')).toBeEnabled()
  expect(screen.getByLabelText('Mensagem')).toHaveValue('Texto para revisar')
  expect(readDraft(actor.id, conversation.id)).toMatchObject({ text: 'Texto para revisar', attachment, scheduleEnabled: true, scheduledAtLocal: '2030-01-05T18:30', pending: null })
  expect(screen.queryByRole('button', { name: 'Conferir mesma operação' })).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Texto revisado pela equipe' } })
  fireEvent.click(screen.getByRole('button', { name: 'Agendar mensagem' }))
  await waitFor(() => expect(requests).toHaveLength(2))
  expect(requests[1].operationId).not.toBe(requests[0].operationId)
  expect(requests[1].text).toBe('Texto revisado pela equipe')
})

it.each([408, 425, 429, 503])('resultado não definitivo %s mantém a mesma operação bloqueada para conferência', async status => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ message: 'Resultado ainda não confirmado.' }, status))
  mount('/whatsapp', actor, <MessageComposer conversationId={conversation.id} onSent={() => {}} />)
  fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Preservar a mesma operação' } })
  fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }))
  expect(await screen.findByRole('button', { name: 'Conferir mesma operação' })).toBeInTheDocument()
  expect(screen.getByLabelText('Mensagem')).toBeDisabled()
  expect(readDraft(actor.id, conversation.id).pending?.operationId).toBeTruthy()
})

it('agenda envio individual no horário de São Paulo e conserva a escolha no rascunho', async () => {
  let request: SendInput | undefined
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => { request = JSON.parse(String(init?.body)); return json({ ...message, direction: 'Outbound', state: 'Scheduled', operationId: request!.operationId }) })
  mount('/whatsapp', actor, <MessageComposer conversationId={conversation.id} onSent={() => {}} />)
  fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Mensagem agendada' } })
  fireEvent.click(screen.getByText('Agendar envio individual', { selector: 'summary' }))
  fireEvent.click(screen.getByLabelText('Enviar em data e hora'))
  fireEvent.change(screen.getByLabelText('Agendar para (horário de São Paulo)'), { target: { value: '2030-01-05T18:30' } })
  expect(readDraft(actor.id, conversation.id)).toMatchObject({ scheduleEnabled: true, scheduledAtLocal: '2030-01-05T18:30' })
  fireEvent.click(screen.getByRole('button', { name: 'Agendar mensagem' }))
  await waitFor(() => expect(request).toMatchObject({ text: 'Mensagem agendada', scheduledAtUtc: '2030-01-05T21:30:00.000Z' }))
})

it('confere aluno, ocorrência e versão antes de gravar RSVP sem alterar frequência ou reserva', async () => {
  const activity = { kind: 'Class' as const, id: 'lesson-fixture', subjectId: 'student-fixture', subjectName: 'Aluno de teste', label: 'Aula de teste', date: '2030-01-05', startTime: '18:00', endTime: '19:00', court: 'Quadra 1', confirmation: 'Pending' as const, version: 0 }
  const posts: { url: string; body: Record<string, unknown> }[] = []
  const fetch = fixtures(); const original = fetch.getMockImplementation()!
  fetch.mockImplementation(async (url, init) => {
    if (String(url).endsWith('/context')) return json({ ...context, identityVerified: true, activities: [activity] })
    if (String(url).endsWith('/conversations/conversation-one')) return json({ ...conversation, identityVerified: true })
    if (init?.method === 'POST') { posts.push({ url: String(url), body: JSON.parse(String(init.body)) }); return json({ ...activity, confirmation: 'Going', version: 1 }) }
    return original(url, init)
  })
  mount(); fireEvent.click(await screen.findByRole('button', { name: 'Ver contexto' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Vai participar' }))
  expect(posts).toHaveLength(0)
  const dialog = within(screen.getByRole('dialog', { name: 'Conferir confirmação' }))
  expect(dialog.getByText(/Aluno de teste/)).toBeVisible()
  fireEvent.click(dialog.getByRole('button', { name: 'Confirmar resposta' }))
  await waitFor(() => expect(posts).toHaveLength(1))
  expect(posts[0].url).toBe('/api/v1/messaging/conversations/conversation-one/confirmations')
  expect(posts[0].body).toMatchObject({ kind: 'Class', activityId: activity.id, subjectId: activity.subjectId, date: activity.date, status: 'Going', expectedVersion: 0 })
})

it('permite à gestão aprovar resposta da arena e salva a versão da configuração conferida', async () => {
  const fetch = fixtures(); const original = fetch.getMockImplementation()!; const writes: { url: string; body: unknown }[] = []
  fetch.mockImplementation(async (url, init) => { if (init?.method) { writes.push({ url: String(url), body: JSON.parse(String(init.body)) }); return json({ id: 'faq-created', question: 'Horários', answer: 'Consulte a agenda', approved: true, version: 1 }) }; return original(url, init) })
  mount('/whatsapp/automacao', manager)
  fireEvent.click(await screen.findByRole('button', { name: 'Nova resposta' }))
  const dialog = within(screen.getByRole('dialog', { name: 'Nova resposta' }))
  fireEvent.change(dialog.getByLabelText('Pergunta ou assunto'), { target: { value: 'Horários' } })
  fireEvent.change(dialog.getByLabelText('Resposta da arena'), { target: { value: 'Consulte a agenda' } })
  fireEvent.click(dialog.getByLabelText('Resposta conferida e aprovada para uso pelo bot'))
  fireEvent.click(dialog.getByRole('button', { name: 'Salvar resposta' }))
  await waitFor(() => expect(writes[0]).toEqual({ url: '/api/v1/messaging/faqs', body: { question: 'Horários', answer: 'Consulte a agenda', approved: true, expectedVersion: 0 } }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  fireEvent.click(await screen.findByRole('button', { name: 'Configurar automação' }))
  fireEvent.click(screen.getByLabelText('Ativar respostas automáticas'))
  fireEvent.click(screen.getByRole('button', { name: 'Salvar automação' }))
  await waitFor(() => expect(writes[1]).toEqual({ url: '/api/v1/messaging/settings', body: { expectedVersion: 1, botEnabled: true, classRemindersEnabled: true, rentalRemindersEnabled: false, reminderTime: '18:00' } }))
})

it('atendente acompanha automação sem oferecer alterações de configuração e conteúdo', async () => {
  fixtures(); mount('/whatsapp/automacao', actor)
  expect(await screen.findByText('Respostas da arena')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Configurar automação' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Nova resposta' })).not.toBeInTheDocument()
})

it('identifica destinatário e mensagem automática em Envios e cancela só a mensagem ainda na fila', async () => {
  const queued = { ...message, direction: 'Outbound', origin: 'Bot', purpose: 'Manual', state: 'Scheduled', conversationName: 'Destinatário de teste', recipientPhone: '5511999998888', operationId: 'outgoing-fixture', scheduledAtUtc: '2030-01-05T21:30:00Z' }
  const writes: { path: string; body: unknown }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (init?.method) { writes.push({ path: String(url), body: JSON.parse(String(init.body)) }); return json({ ...queued, state: 'Cancelled' }) }
    if (String(url).includes('/sends?')) return json({ items: [queued], total: 1, page: 1, pageSize: 20 })
    return json({ state: 'Disabled' })
  })
  mount('/whatsapp/envios')
  expect(await screen.findByText('Destinatário de teste')).toBeVisible()
  expect(screen.getByText('Resposta automática')).toBeVisible()
  expect(screen.getByText(/A ausência de confirmação de leitura não significa falha/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar envio' }))
  await waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0].path).toBe('/api/v1/messaging/messages/message-one/cancel')
})
