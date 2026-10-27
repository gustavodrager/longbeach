import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Disclosure, RecordTable } from '../../components/managementUi'
import { isManagement } from '../auth/access'
import { useAuth } from '../auth/authContext'
import { centsMoney, monthLabel, useHistory } from './financialHistoryApi'
import './importedBankMovements.css'

const banks = { 'pagbank-conta': 'PagBank', 'c6-conta': 'C6' } as const
type Bank = keyof typeof banks

export function ImportedBankMovements() {
  const { user } = useAuth()
  const titleId = useId()
  const [selection, setSelection] = useState<{ bank: Bank; month: string }>({ bank: 'pagbank-conta', month: '' })
  const query = useHistory(new URLSearchParams({ series: selection.bank, ...(selection.month ? { month: selection.month } : {}) }))
  if (!isManagement(user)) return null

  const report = query.isError ? undefined : query.data
  const months = [...new Set([...(report?.months ?? []), ...(selection.month ? [selection.month] : []), ...(report ? [report.month] : [])])].sort().reverse()
  const historyLink = (metric?: string) => `/financeiro/historico?${new URLSearchParams({ series: selection.bank, month: report!.month, ...(metric ? { metric } : {}) })}`
  const preview = report?.items.slice(0, 5) ?? []
  const previewSources = [...new Set(preview.map(item => item.sourceName))]
  const cards = [
    { label: 'Entradas no extrato', metric: 'entradas-extrato' },
    { label: 'Saídas no extrato', metric: 'saidas-extrato' },
  ]

  return <section className="arena-dashboard-section imported-bank-movements" aria-labelledby={titleId}>
    <div className="arena-section-heading"><div><p className="arena-section-eyebrow">EXTRATOS · IMPORTAÇÃO MANUAL</p><h2 id={titleId}>Movimentos importados dos bancos</h2></div>{report && <Link className="secondary-link" to={historyLink()}>Ver todos os movimentos e origens →</Link>}</div>
    <div className="compact-filters">
      <label className="operation-field">Banco dos movimentos<select value={selection.bank} onChange={event => setSelection({ bank: event.target.value as Bank, month: '' })}>{Object.entries(banks).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="operation-field">Mês dos movimentos<select value={selection.month || report?.month || ''} disabled={!months.length} onChange={event => setSelection({ ...selection, month: event.target.value })}>{!months.length && <option value="">{query.isPending ? 'Consultando meses…' : 'Sem período disponível'}</option>}{months.map(month => <option key={month} value={month}>{monthLabel(month)}</option>)}</select></label>
    </div>
    <p className="arena-hint">O mês selecionado vale apenas para este bloco. Os arquivos importados são a fonte destes valores.</p>
    {query.isPending && <p role="status">Carregando movimentos importados…</p>}
    {query.isError && <p role="alert">Não foi possível consultar os movimentos importados do {banks[selection.bank]}. <button type="button" disabled={query.isFetching} onClick={() => void query.refetch()}>Tentar novamente</button></p>}
    {report && <>
      <p className="imported-bank-period"><strong>{banks[selection.bank]} · {monthLabel(report.month)}</strong> · {report.total} movimento(s) importado(s)</p>
      {report.total > 0 ? <>
        <div className="arena-metric-grid">{cards.map(card => {
          const totals = report.totals.filter(total => total.series === selection.bank && total.metric === card.metric)
          return <Link className="arena-metric" key={card.metric} to={historyLink(card.metric)}><span className="arena-metric-label">{card.label}</span><strong>{centsMoney(Math.abs(totals.reduce((sum, total) => sum + total.amountCents, 0)))}</strong><small>{totals.reduce((sum, total) => sum + total.records, 0)} movimento(s) · {monthLabel(report.month)}</small><span className="arena-link-label">Conferir origem →</span></Link>
        })}</div>
        <p className="arena-hint">Prévia dos primeiros {preview.length} de {report.total} movimentos do mês, em ordem de data. A origem abaixo pertence a cada movimento exibido.</p>
        <p className="arena-hint imported-bank-sources"><strong>Arquivos na prévia:</strong> {previewSources.join(' · ')}</p>
        <Disclosure title={`Ver prévia de ${preview.length} movimentos e suas origens`} lazy>
          <RecordTable label={`Prévia dos movimentos importados do ${banks[selection.bank]}`} columns={['Data', 'Movimento', 'Valor', 'Origem']} rows={preview.map(item => ({ key: item.id, cells: [item.data.periodStart.split('-').reverse().join('/'), item.data.label, centsMoney(item.data.amountCents), item.sourceName] }))} />
        </Disclosure>
      </> : <p>Sem movimentos importados neste período para o {banks[selection.bank]}.</p>}
    </>}
    <p className="imported-bank-note">Movimentos do extrato podem incluir transferências, liquidações, taxas e pagamentos já registrados nas contas. Estes valores ficam separados dos recebimentos das contas e dos resultados da arena, sem gerar outro pagamento. O saldo bancário mantém a data e a origem do extrato de saldo.</p>
  </section>
}
