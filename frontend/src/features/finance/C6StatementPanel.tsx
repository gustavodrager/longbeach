import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../lib/http'
import { useAuth } from '../auth/authContext'
import { isManagement } from '../auth/access'

type Entry = {
  id: string; entryId: string; bookedDate: string; amountCents: number; title: string; description: string
  operationType: string; transactionType: string; endToEndId: string | null; sourceSha256: string; linkedPaymentId?: string | null
}
type Report = { environment: string; account: string; from: string; through: string; items: Entry[]; total: number; page: number }
const money = (value: number) => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const displayDate = (value: string) => value.split('-').reverse().join('/')
function todayInBrazil() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = (type: string) => parts.find(item => item.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
function initialRange() {
  const through = todayInBrazil()
  const date = new Date(`${through}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 29)
  return { from: date.toISOString().slice(0, 10), through }
}
function validRange(from: string, through: string) {
  const days = (Date.parse(through) - Date.parse(from)) / 86_400_000
  return /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(through) && Number.isFinite(days) && days >= 0 && days <= 29 && through <= todayInBrazil()
}

export function C6StatementPanel() {
  const { user } = useAuth()
  const [range, setRange] = useState(initialRange)
  const [from, setFrom] = useState(range.from)
  const [through, setThrough] = useState(range.through)
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const allowed = isManagement(user)
  const query = useQuery({
    queryKey: ['c6-statement', user?.id, range.from, range.through, page], enabled: allowed,
    queryFn: async () => {
      const result = await apiFetch<Report>(`/api/v1/financial-history/c6?${new URLSearchParams({ ...range, page: String(page) })}`)
      if (!Array.isArray(result.items) || !Number.isInteger(result.total) || result.total < 0 || !Number.isInteger(result.page)) throw new Error('Resposta do extrato C6 incompleta.')
      return result
    },
  })
  if (!allowed) return null
  const report = query.isError ? undefined : query.data
  function search() {
    setError('')
    if (!validRange(from, through)) { setError('Selecione até 30 dias, terminando no máximo hoje.'); return }
    setRange({ from, through }); setPage(1)
  }
  return <section aria-labelledby="c6-statement-title">
    <h2 id="c6-statement-title">Consultas C6 anteriores</h2>
    <p>Histórico anterior à suspensão das consultas automáticas. Novos arquivos: Extrato bancário C6, no histórico financeiro.</p>
    <form className="compact-filters" onSubmit={event => { event.preventDefault(); search() }}>
      <label className="operation-field">Início do extrato C6<input type="date" required value={from} max={todayInBrazil()} onChange={event => setFrom(event.target.value)} /></label>
      <label className="operation-field">Fim do extrato C6<input type="date" required value={through} min={from} max={todayInBrazil()} onChange={event => setThrough(event.target.value)} /></label>
      <button type="submit">Filtrar extrato</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {query.isPending && <p role="status">Carregando extrato C6…</p>}
    {query.isError && <p role="alert">Não foi possível consultar o extrato C6. <button type="button" onClick={() => void query.refetch()}>Tentar novamente</button></p>}
    {report && <>
      <p><strong>{report.account ? `Conta: ${report.account}` : 'Conta não identificada nesta fonte.'}</strong> · {displayDate(report.from)} a {displayDate(report.through)}</p>
      {report.environment === 'Sandbox' && <p role="status">Ambiente de testes C6 — estes valores não representam dinheiro real.</p>}
      {!report.items.length ? <p>Nenhum movimento de consultas C6 anteriores neste período.</p> : <div className="responsive-records"><table aria-label="Movimentos da conta C6"><thead><tr><th scope="col">Data</th><th scope="col">Descrição</th><th scope="col">Valor</th><th scope="col">Conferência</th></tr></thead><tbody>{report.items.map(entry => <tr key={entry.id}>
        <td data-label="Data">{displayDate(entry.bookedDate)}</td><td data-label="Descrição"><strong>{entry.title || 'Movimento bancário'}</strong><p>{entry.description}</p><details><summary>Identificação do movimento</summary><p>{entry.entryId.startsWith('sha256:') ? 'Identificação interna da leitura' : 'Referência bancária'}: <span className="source-hash">{entry.entryId}</span></p>{entry.endToEndId && <p>Identificador Pix: <span className="source-hash">{entry.endToEndId}</span></p>}</details></td>
        <td data-label="Valor">{money(entry.amountCents)}</td><td data-label="Conferência">{entry.linkedPaymentId ? 'Vinculado a pagamento da LongBeach' : 'A conferir'}</td>
      </tr>)}</tbody></table></div>}
      {report.total > 50 && <nav className="arena-actions" aria-label="Páginas do extrato C6"><button type="button" disabled={page === 1 || query.isFetching} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página {page} de {Math.ceil(report.total / 50)}</span><button type="button" disabled={page * 50 >= report.total || query.isFetching} onClick={() => setPage(value => value + 1)}>Próxima</button></nav>}
    </>}
  </section>
}
