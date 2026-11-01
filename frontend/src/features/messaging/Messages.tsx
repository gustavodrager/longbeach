import { useContext, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError, apiFetch, apiFetchBlob } from '../../lib/http'
import { ModalPanel } from '../../components/managementUi'
import { useAuth } from '../auth/authContext'
import { hasPermission } from '../auth/access'
import { MessagingDelivery, MessagingRuntime, dateTime, messagingCommand, messagingPath, originLabel, useMessagingAction, useMessagingQuery, useMessagingRefresh, type Attachment, type Message, type MessagePage, type SendInput } from './api'
import { readDraft, saveDraft, type MessageDraft } from './drafts'
import { ActionNotice, MessageStatus, QueryNotice } from './shared'

export function MessageAttachment({ attachment }: { attachment: Attachment }) {
  const [source, setSource] = useState(''); const action = useMessagingAction(); const controller = useRef<AbortController | null>(null)
  const url = useRef('')
  useEffect(() => () => { controller.current?.abort(); if (url.current) URL.revokeObjectURL(url.current) }, [])
  const audio = attachment.contentType.startsWith('audio/'); const image = attachment.contentType.startsWith('image/')
  async function open() {
    if (source) return
    controller.current = new AbortController()
    const blob = await action.run(() => apiFetchBlob(messagingPath(`/attachments/${encodeURIComponent(attachment.id)}`), controller.current!.signal))
    if (blob) { url.current = URL.createObjectURL(blob); setSource(url.current) }
  }
  return <div className="whatsapp-attachment">
    {source ? <>{image ? <a href={source} download={attachment.fileName}><img src={source} alt={attachment.fileName} /></a> : audio ? <audio src={source} controls preload="metadata" aria-label={`Áudio: ${attachment.fileName}`} /> : null}<a href={source} download={attachment.fileName}>{image || audio ? 'Baixar' : 'Baixar PDF'} · {attachment.fileName}</a></> : <button className="text-button" type="button" disabled={action.busy} onClick={() => void open()}>{action.busy ? 'Abrindo…' : audio ? 'Ouvir áudio' : image ? 'Abrir imagem' : 'Abrir documento'} · {attachment.fileName}</button>}
    <small>{Math.max(1, Math.ceil(attachment.length / 1024))} KB</small><ActionNotice action={action} />
  </div>
}

export function MessageRecovery({ message }: { message: Message }) {
  const { user } = useAuth(); const action = useMessagingAction(); const refresh = useMessagingRefresh()
  const [review, setReview] = useState<Message | null>(null); const retryId = useRef(crypto.randomUUID()); const cancelId = useRef(crypto.randomUUID())
  const allowed = hasPermission(user, 'messaging:operate')
  if (!allowed || message.direction !== 'Outbound') return null
  async function check() {
    if (!message.operationId) return
    await action.run(async () => {
      const current = await apiFetch<Message>(messagingPath(`/operations/${message.operationId}`))
      await refresh()
      return current
    }, 'Situação consultada. Nenhuma nova mensagem foi criada.')
  }
  async function prepareRetry() {
    if (!message.operationId) return
    const current = await action.run(() => apiFetch<Message>(messagingPath(`/operations/${message.operationId}`)))
    if (current?.state === 'Failed') { retryId.current = crypto.randomUUID(); setReview(current) }
    else if (current) { action.setError('A situação mudou. Confira a mensagem atualizada antes de enviar novamente.'); await refresh() }
  }
  async function retry() {
    if (!review) return
    const result = await action.run(() => messagingCommand<Message>(`/conversations/${review.conversationId}/messages`, { operationId: retryId.current, text: review.text, attachmentId: review.attachment?.id, purpose: ['ClassReminder', 'RentalReminder', 'BarStatement'].includes(review.purpose) ? review.purpose : 'Manual', contextKind: review.contextKind, contextId: review.contextId, contextDate: review.contextDate }), 'Novo envio registrado.')
    if (result) { setReview(null); await refresh() }
  }
  return <div className="whatsapp-message-recovery">
    {message.state === 'Uncertain' && <><p>Confira a mesma operação antes de qualquer novo envio.</p><button type="button" className="secondary-link" disabled={action.busy || !message.operationId} onClick={() => void check()}>Conferir mesma operação</button></>}
    {message.state === 'Failed' && <button type="button" className="secondary-link" disabled={action.busy || !message.operationId} onClick={() => void prepareRetry()}>Revisar novo envio</button>}
    {['Scheduled', 'Queued'].includes(message.state) && <button type="button" className="text-button" disabled={action.busy} onClick={() => void action.run(async () => { const result = await messagingCommand<Message>(`/messages/${message.id}/cancel`, { operationId: cancelId.current }); await refresh(); return result }, 'Envio cancelado.')}>Cancelar envio</button>}
    <ActionNotice action={action} />
    {review && <ModalPanel title="Revisar novo envio" onClose={() => { if (!action.busy) setReview(null) }}><div className="whatsapp-dialog-content"><p>A tentativa anterior falhou. Confira o conteúdo antes de criar um novo envio.</p><p className="whatsapp-preserve-lines">{review.text}</p>{review.attachment && <p>Anexo: {review.attachment.fileName}</p>}<ActionNotice action={action} /><button type="button" className="primary-link" disabled={action.busy} onClick={() => void retry()}>Confirmar novo envio</button></div></ModalPanel>}
  </div>
}

export function MessageThread({ conversationId, onSeen }: { conversationId: string; onSeen: () => void }) {
  const query = useMessagingQuery<MessagePage>(`/conversations/${conversationId}/messages?limit=50`, 5_000)
  const [messages, setMessages] = useState<Message[]>([]); const [newCount, setNewCount] = useState(0)
  const action = useMessagingAction(); const scroller = useRef<HTMLDivElement>(null)
  const initial = useRef(true); const atBottom = useRef(true); const ids = useRef(new Set<string>()); const before = useRef<string | null>(null)
  const [hasMore, setHasMore] = useState(false); const anchor = useRef<{ top: number; height: number } | null>(null)
  const seen = useRef(onSeen); seen.current = onSeen
  function merge(incoming: Message[], older = false) {
    const added = incoming.filter(message => !ids.current.has(message.id))
    incoming.forEach(message => ids.current.add(message.id))
    if (!initial.current && !older && !atBottom.current && added.length) setNewCount(count => count + added.length)
    setMessages(current => {
      const all = new Map(current.map(message => [message.id, message]))
      incoming.forEach(message => all.set(message.id, message))
      return [...all.values()].sort((a, b) => a.occurredAtUtc.localeCompare(b.occurredAtUtc) || a.id.localeCompare(b.id))
    })
  }
  useEffect(() => {
    if (!query.data) return
    if (initial.current) { before.current = query.data.before; setHasMore(query.data.hasMore) }
    merge(query.data.items)
  }, [query.data])
  useLayoutEffect(() => {
    const element = scroller.current
    if (!element || !messages.length) return
    if (anchor.current) { element.scrollTop = anchor.current.top + element.scrollHeight - anchor.current.height; anchor.current = null }
    else if (initial.current || atBottom.current) { element.scrollTop = element.scrollHeight; setNewCount(0); seen.current() }
    initial.current = false
  }, [messages])
  async function older() {
    if (!hasMore || !before.current) return
    const page = await action.run(() => apiFetch<MessagePage>(messagingPath(`/conversations/${conversationId}/messages?${new URLSearchParams({ before: before.current!, limit: '50' })}`)))
    if (page) { const element = scroller.current; if (element) anchor.current = { top: element.scrollTop, height: element.scrollHeight }; before.current = page.before; setHasMore(page.hasMore); merge(page.items, true) }
  }
  function latest() { atBottom.current = true; const element = scroller.current; if (element) element.scrollTop = element.scrollHeight; setNewCount(0); seen.current() }
  const accessDenied = query.error instanceof ApiError && [401, 403, 404, 410].includes(query.error.status)
  return <div className="whatsapp-thread-area">
    <div className="whatsapp-thread" ref={scroller} role="region" aria-label="Histórico da conversa" tabIndex={0} onScroll={() => { const element = scroller.current; if (!element) return; atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 64; if (atBottom.current) { setNewCount(0); seen.current() } }}>
      {hasMore && <button type="button" className="text-button whatsapp-older" disabled={action.busy} onClick={() => void older()}>Carregar mensagens anteriores</button>}
      <QueryNotice query={query} label="atualizar as mensagens" /><ActionNotice action={action} />
      {!query.isPending && !query.isError && !messages.length && <p className="whatsapp-notice">Esta conversa ainda não tem mensagens.</p>}
      {(accessDenied ? [] : messages).map(message => <article className={`whatsapp-message ${message.direction === 'Inbound' ? 'is-inbound' : 'is-outbound'}`} key={message.id} aria-label={`${originLabel[message.origin]} · ${dateTime(message.occurredAtUtc)}`}><header><strong>{originLabel[message.origin]}{message.authorName ? ` · ${message.authorName}` : ''}</strong><time dateTime={message.occurredAtUtc}>{dateTime(message.occurredAtUtc)}</time></header>{message.text && <p className="whatsapp-preserve-lines">{message.text}</p>}{message.attachment && <MessageAttachment key={message.attachment.id} attachment={message.attachment} />}<footer><MessageStatus state={message.state} />{message.scheduledAtUtc && <span>Para {dateTime(message.scheduledAtUtc)}</span>}</footer>{message.failureReason && <p className="whatsapp-failure">{message.failureReason}</p>}<MessageRecovery message={message} /></article>)}
    </div>
    {newCount > 0 && <button className="whatsapp-new-messages" aria-live="polite" type="button" onClick={latest}>Novas mensagens ({newCount}) ↓</button>}
  </div>
}

export function MessageComposer({ conversationId, onSent, blockedBy = null }: { conversationId: string; onSent: () => void; blockedBy?: string | null }) {
  const { user } = useAuth(); const environment = useContext(MessagingRuntime); const refresh = useMessagingRefresh()
  const delivery = useContext(MessagingDelivery)
  const [draft, setDraft] = useState<MessageDraft>(() => readDraft(user!.id, conversationId)); const [storageError, setStorageError] = useState('')
  const [canRepeat, setCanRepeat] = useState(false); const action = useMessagingAction(); const upload = useMessagingAction(); const input = useRef<HTMLInputElement>(null)
  const allowed = hasPermission(user, 'messaging:operate'); const busy = action.busy || upload.busy
  const locked = busy || Boolean(draft.pending) || !allowed || Boolean(blockedBy)
  function change(next: MessageDraft) {
    setDraft(next)
    try { saveDraft(user!.id, conversationId, next); setStorageError(''); return true }
    catch { setStorageError('O navegador não conseguiu guardar este rascunho. Mantenha esta conversa aberta e tente novamente.'); return false }
  }
  async function accepted(result: Message) {
    if (result.state !== 'Uncertain') { change({ text: '' }); setCanRepeat(false) }
    onSent(); await refresh()
  }
  async function send(event?: FormEvent, preserved?: SendInput) {
    event?.preventDefault()
    if (!allowed || blockedBy || busy || !environment.online || (!preserved && draft.pending)) return
    const body: SendInput = preserved ?? { operationId: crypto.randomUUID(), text: draft.text.trim(), attachmentId: draft.attachment?.id, purpose: 'Manual' }
    if (!preserved && draft.scheduleEnabled) {
      const scheduled = new Date(`${draft.scheduledAtLocal ?? ''}:00-03:00`)
      if (!Number.isFinite(scheduled.getTime()) || scheduled.getTime() <= Date.now()) { action.setError('Escolha uma data e hora futura de São Paulo para agendar.'); return }
      body.scheduledAtUtc = scheduled.toISOString()
    }
    if (!body.text && !body.attachmentId) return
    if (!change({ ...draft, pending: body })) return
    const result = await action.run(async () => {
      try { return await messagingCommand<Message>(`/conversations/${conversationId}/messages`, body) }
      catch (cause) {
        // Explicit rejection did not enqueue this request. Keep the editable draft;
        // timeouts, throttling and unknown server outcomes keep the original operation.
        if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500 && ![408, 425, 429].includes(cause.status)) {
          change({ ...draft, pending: null }); setCanRepeat(false)
          throw new ApiError(cause.status, `${cause.message} O rascunho foi preservado para revisão. Confira a conversa antes de iniciar outro envio.`)
        }
        throw cause
      }
    })
    if (result) await accepted(result)
  }
  async function check() {
    if (!draft.pending) return
    setCanRepeat(false)
    const result = await action.run(async () => {
      try { return await apiFetch<Message>(messagingPath(`/operations/${draft.pending!.operationId}`)) }
      catch (cause) { if (cause instanceof ApiError && cause.status === 404) { setCanRepeat(true); throw new Error('A operação ainda não foi localizada. Você pode conferir novamente ou repetir exatamente a mesma operação.'); } throw cause }
    })
    if (result) await accepted(result)
  }
  async function attach(file?: File) {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type) || file.size > 10 * 1024 * 1024) { upload.setError('Escolha uma imagem JPG/PNG ou um PDF de até 10 MB.'); return }
    const body = new FormData(); body.append('file', file)
    const uploaded = await upload.run(() => apiFetch<Attachment>(messagingPath('/attachments'), { method: 'POST', body }))
    if (uploaded) change({ ...draft, attachment: uploaded })
    if (input.current) input.current.value = ''
  }
  return <form className="whatsapp-composer" onSubmit={event => void send(event)} onInvalidCapture={event => { const field = event.target as HTMLElement; field.closest('details')?.setAttribute('open', ''); requestAnimationFrame(() => field.focus()) }}>
    {blockedBy && <p className="whatsapp-notice" role="status">Esta conversa foi assumida por {blockedBy}. Seu rascunho permanece guardado; aguarde a liberação pela equipe para responder.</p>}
    {draft.pending && <div className="whatsapp-pending-send" role="status"><p>Este envio precisa de confirmação. O rascunho e a mesma operação foram preservados.</p><button className="secondary-link" type="button" disabled={busy || !environment.online} onClick={() => void check()}>Conferir mesma operação</button>{canRepeat && <button className="secondary-link" type="button" disabled={busy || !environment.online || !allowed || Boolean(blockedBy)} onClick={() => void send(undefined, draft.pending!)}>Repetir mesma operação</button>}</div>}
    <label htmlFor={`message-${conversationId}`}>Mensagem</label><textarea id={`message-${conversationId}`} value={draft.text} maxLength={16_000} rows={3} placeholder={allowed ? 'Escreva sua resposta…' : 'Seu acesso permite acompanhar esta conversa.'} disabled={locked} onChange={event => change({ ...draft, text: event.target.value })} />
    {draft.attachment && <div className="whatsapp-compose-attachment"><span>{draft.attachment.fileName}</span><button type="button" className="text-button" disabled={locked} onClick={() => change({ ...draft, attachment: null })}>Remover anexo</button></div>}
    {allowed && <details className="whatsapp-schedule"><summary>Agendar envio individual</summary><label className="whatsapp-check"><input type="checkbox" disabled={locked} checked={Boolean(draft.scheduleEnabled)} onChange={event => change({ ...draft, scheduleEnabled: event.target.checked })} />Enviar em data e hora</label>{draft.scheduleEnabled && <label className="operation-field">Agendar para (horário de São Paulo)<input type="datetime-local" value={draft.scheduledAtLocal ?? ''} required disabled={locked} onChange={event => change({ ...draft, scheduledAtLocal: event.target.value })} /></label>}</details>}
    <ActionNotice action={action} /><ActionNotice action={upload} />{storageError && <p role="alert">{storageError}</p>}
    <div className="whatsapp-composer-actions"><label className={`secondary-link whatsapp-file-button ${locked ? 'is-disabled' : ''}`}>Anexar imagem ou PDF<input ref={input} type="file" accept="image/jpeg,image/png,application/pdf" disabled={locked || !environment.online} aria-label="Anexar imagem ou PDF" onChange={event => void attach(event.target.files?.[0])} /></label><small>Até 10 MB</small><button type="submit" className="primary-link" disabled={locked || !environment.online || (!draft.text.trim() && !draft.attachment)}>{action.busy ? 'Registrando…' : draft.scheduleEnabled ? 'Agendar mensagem' : delivery.waiting ? 'Colocar na fila' : 'Enviar mensagem'}</button></div>
    {delivery.waiting && <p className="whatsapp-composer-hint" role="status">Envios aguardam a conexão ser ativada. Mensagens colocadas na fila serão enviadas quando ela voltar.</p>}{allowed && <small className="whatsapp-composer-hint">Sua resposta pausa o bot nesta conversa. Não há gravação de áudio.</small>}
  </form>
}
