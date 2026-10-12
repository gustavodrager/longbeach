import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../lib/http'

export function EdiReprocessForm() {
  const cache = useQueryClient()
  const [from, setFrom] = useState('')
  const [through, setThrough] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const yesterday = new Date(Date.now() - 27 * 60 * 60 * 1000).toISOString().slice(0, 10)
  async function reprocess() {
    setMessage(''); setError('')
    const days = (Date.parse(through) - Date.parse(from)) / 86_400_000
    if (!Number.isFinite(days) || days < 0 || days > 6 || through > yesterday) {
      setError('Selecione até sete dias, terminando no máximo ontem.'); return
    }
    setBusy(true)
    try {
      await apiFetch('/api/v1/financial-history/pagbank-edi/reprocess', { method: 'POST', body: JSON.stringify({ from, through, reason: reason.trim() }) })
      setMessage('Período consultado e validado. Os documentos foram atualizados sem criar novos recebimentos.')
    } catch (e) {
      setError(`${e instanceof Error ? e.message : 'Não foi possível concluir a consulta.'} Dias já concluídos permanecem salvos; você pode consultar o mesmo período novamente.`)
    } finally {
      setBusy(false)
      void cache.invalidateQueries({ queryKey: ['pagbank-documents'] })
      void cache.invalidateQueries({ queryKey: ['financial-integrations'] })
    }
  }
  return <details><summary>Consultar novamente um período do PagBank</summary>
    <p>Use até sete dias por consulta. O EDI precisa estar configurado. Esta ação preserva o histórico e não realiza pagamentos.</p>
    <form onSubmit={e => { e.preventDefault(); void reprocess() }}>
      <label className="arena-field">Data inicial<input type="date" required min="2000-01-01" max={yesterday} value={from} disabled={busy} onChange={e => setFrom(e.target.value)} /></label>
      <label className="arena-field">Data final<input type="date" required min={from || '2000-01-01'} max={yesterday} value={through} disabled={busy} onChange={e => setThrough(e.target.value)} /></label>
      <label className="arena-field">Motivo da consulta<input required minLength={3} maxLength={500} value={reason} disabled={busy} onChange={e => setReason(e.target.value)} /></label>
      <button type="submit" disabled={busy}>{busy ? 'Consultando período…' : 'Consultar e atualizar documentos'}</button>
    </form>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </details>
}
