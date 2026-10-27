import { useRef, useState, type ChangeEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Disclosure } from '../../components/managementUi'
import { apiFetch } from '../../lib/http'
import { useAuth } from '../auth/authContext'
import './expense-attachments.css'

type Attachment = { id: string; expenseId: string; fileName: string; contentType: string; size: number; createdAtUtc: string }
type AttachmentContent = { fileName: string; contentType: string; contentBase64: string }
const maximumSize = 2_000_000
const formats = ['application/pdf', 'image/jpeg', 'image/png']
const fileContent = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result.slice(reader.result.indexOf(',') + 1)) : reject(new Error('Não foi possível ler o comprovante.'))
  reader.onerror = () => reject(new Error('Não foi possível ler o comprovante.'))
  reader.readAsDataURL(file)
})

export function ExpenseAttachments({ expenseId, canWrite, onBusyChange }: { expenseId: string; canWrite: boolean; onBusyChange?: (busy: boolean) => void }) {
  const { user } = useAuth()
  const cache = useQueryClient()
  const endpoint = `/api/v1/expenses/${expenseId}/attachments`
  const queryKey = ['expense-attachments', user?.id, expenseId]
  const attachments = useQuery({ queryKey, queryFn: () => apiFetch<Attachment[]>(endpoint) })
  const [file, setFile] = useState<File | null>(null)
  const [operationId, setOperationId] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const lock = useRef(false)
  const downloadLock = useRef(false)
  const input = useRef<HTMLInputElement>(null)

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null
    setError(''); setNotice(''); setFile(null); setOperationId(crypto.randomUUID())
    if (!selected) return
    if (!selected.size || selected.size > maximumSize) { setError('Escolha um comprovante de até 2 MB.'); event.target.value = ''; return }
    if (!formats.includes(selected.type) && !/\.(pdf|jpe?g|png)$/i.test(selected.name)) { setError('Use um comprovante PDF, JPG ou PNG.'); event.target.value = ''; return }
    setFile(selected)
  }
  async function upload() {
    if (!file || lock.current) return
    lock.current = true; setBusy(true); onBusyChange?.(true); setError(''); setNotice('')
    try {
      const contentBase64 = await fileContent(file)
      await apiFetch<Attachment>(endpoint, { method: 'POST', body: JSON.stringify({ operationId, fileName: file.name, contentBase64 }) })
      setFile(null); setOperationId(crypto.randomUUID()); if (input.current) input.current.value = ''
      setNotice('Comprovante anexado.')
      await cache.invalidateQueries({ queryKey })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível anexar. O lançamento continua salvo; tente novamente com o mesmo arquivo.') }
    finally { lock.current = false; setBusy(false); onBusyChange?.(false) }
  }
  async function download(attachment: Attachment) {
    if (downloadLock.current) return
    downloadLock.current = true; setDownloading(attachment.id); setError('')
    try {
      const content = await apiFetch<AttachmentContent>(`${endpoint}/${attachment.id}`)
      if (!formats.includes(content.contentType)) throw new Error('Formato de comprovante inválido.')
      const bytes = Uint8Array.from(atob(content.contentBase64), character => character.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: content.contentType }))
      const link = document.createElement('a'); link.href = url; link.download = content.fileName; document.body.append(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível baixar o comprovante.') }
    finally { downloadLock.current = false; setDownloading(null) }
  }

  return <div data-unsaved-ignore><Disclosure title="Comprovantes" count={attachments.data?.length}>
    {attachments.isPending && <p role="status">Carregando comprovantes…</p>}
    {attachments.isError && <p role="alert">Não foi possível consultar os comprovantes. <button type="button" onClick={() => void attachments.refetch()}>Tentar novamente</button></p>}
    {attachments.isSuccess && !attachments.data.length && <p className="arena-hint">Nenhum comprovante anexado.</p>}
    {attachments.isSuccess && attachments.data.length > 0 && <ul className="expense-attachments-list">{attachments.data.map(attachment => <li key={attachment.id}><span>{attachment.fileName}<small>{Math.ceil(attachment.size / 1024)} KB</small></span><button type="button" className="secondary-link" disabled={downloading !== null} onClick={() => void download(attachment)}>{downloading === attachment.id ? 'Baixando…' : 'Baixar'}</button></li>)}</ul>}
    {canWrite && <div className="expense-attachment-upload"><label className="operation-field">Comprovante opcional<input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" disabled={busy} onChange={choose} /></label><p className="arena-hint">PDF, JPG ou PNG · até 2 MB.</p>{file && <button type="button" className="secondary-link" disabled={busy} onClick={() => void upload()}>{busy ? 'Anexando…' : 'Anexar comprovante'}</button>}</div>}
    {error && <p role="alert" className="arena-message arena-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </Disclosure></div>
}
