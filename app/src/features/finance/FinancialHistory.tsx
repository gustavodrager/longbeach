import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../lib/http'
import { useAuth } from '../auth/authContext'
import { Disclosure, ModalPanel, RecordTable } from '../../components/managementUi'

type Total = { series: string; metric: string; state: string; period: string; grain: string; amountCents: number; records: number }
type Observation = { sourceCell: string; series: string; metric: string; label: string; state: string; periodStart: string; periodEnd: string; grain: string; amountCents: number; notes: string }
type Report = { month: string; months: string[]; totals: Total[]; items: { id: string; sourceName: string; sourceSha256: string; data: Observation }[]; total: number; page: number; updatedAtUtc: string }
type Integration = { provider: string; state: string; detail: string; lastSuccessUtc: string | null; failureCode: string | null; completeThrough: string | null }
export type HistoryPreview = { batchId: string; sourceName: string; applied: boolean; confirmationToken: string; creates: number; matches: number; totals: Total[] }
export const seriesLabels: Record<string, string> = { consolidado: 'Resumo mensal da arena', 'consolidado-com-dividas': 'Resumo mensal com parcelas de dívidas', 'compras-detalhadas': 'Compras detalhadas', 'servicos-detalhados': 'Pagamentos de serviços', saldos: 'Saldos e compromissos em uma data', alunos: 'Controle de alunos', mensalistas: 'Controle de mensalistas', aulas: 'Controle de aulas', 'pagvendas-vendas': 'Vendas registradas no PagVendas', 'pagbank-conta': 'Extrato bancário PagBank', 'despesas-fora-pagbank': 'Despesas pagas fora do PagBank' }
const metrics: Record<string, string> = { 'vendas-bar-bruto': 'Vendas brutas do bar', 'receitas-consolidadas': 'Receitas do consolidado', despesas: 'Despesas informadas', 'receitas-arena': 'Outras receitas da arena', 'valor-informado': 'Valor no controle', 'valor-escalonavel': 'Valor escalonável das aulas', 'vendas-informadas': 'Vendas informadas no PagVendas' }
export const centsMoney = (value: number) => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const monthLabel = (value: string) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + '-01T12:00:00Z'))
function useHistory(params: URLSearchParams) {
  const { user } = useAuth()
  return useQuery({ queryKey: ['financial-history', user?.id, params.toString()], queryFn: async () => { const report = await apiFetch<Report>(`/api/v1/financial-history?${params}`); if (!Array.isArray(report.items) || !Array.isArray(report.totals) || !Array.isArray(report.months) || !/^\d{4}-\d{2}$/.test(report.month)) throw new Error('Resposta financeira inválida.'); return report }, enabled: Boolean(user?.roles.includes('Owner')), refetchInterval: 60_000 })
}

export function FinancialHistoryOverview() {
  const { user } = useAuth(); const query = useHistory(new URLSearchParams({ series: 'consolidado' })); const vendas = useHistory(new URLSearchParams({ series: 'pagvendas-vendas' }))
  if (!user?.roles.includes('Owner')) return null
  const report = query.data
  return <section className="arena-dashboard-section" aria-labelledby="financial-history-title">
    <div className="arena-section-heading"><div><p className="arena-section-eyebrow">HISTÓRICO E CONTROLES</p><h2 id="financial-history-title">Movimentação disponível da arena</h2></div><Link className="secondary-link" to="/financeiro/historico">Abrir histórico e fontes →</Link></div>
    <p className="arena-hint">{report?.items.length ? `Último resumo disponível: ${monthLabel(report.month)}. Valores informados na planilha; confira os registros e os períodos disponíveis.` : query.isPending ? 'Carregando histórico…' : 'Aguardando a aplicação dos controles financeiros.'}</p>
    {query.isError && <p role="alert" className="arena-message arena-error">Não foi possível atualizar o histórico. Tente novamente.</p>}
    {report && report.totals.length > 0 && <div className="arena-metric-grid">{report.totals.map(total => <Link key={`${total.series}:${total.metric}:${total.state}:${total.period}:${total.grain}`} className="arena-metric" to={`/financeiro/historico?${new URLSearchParams({ month: report.month, series: total.series, metric: total.metric })}`}><span className="arena-metric-label">{metrics[total.metric] ?? total.metric}</span><strong>{centsMoney(total.metric === 'despesas' ? Math.abs(total.amountCents) : total.amountCents)}</strong><small>{monthLabel(report.month)} · {total.state}</small><small>{total.records} registros da fonte</small><span className="arena-link-label">Conferir origem →</span></Link>)}</div>}
    {vendas.isError && <p role="alert">Não foi possível atualizar o relatório PagVendas.</p>}
    {vendas.data && vendas.data.totals.length > 0 && <div className="arena-metric-grid">{vendas.data.totals.map(total => <Link key={`${total.series}:${total.metric}:${total.state}:${total.period}:${total.grain}`} className="arena-metric" to={`/financeiro/historico?${new URLSearchParams({ month: vendas.data!.month, series: total.series })}`}><span className="arena-metric-label">{metrics[total.metric] ?? total.metric}</span><strong>{centsMoney(total.amountCents)}</strong><small>{monthLabel(total.period)} · {total.state}</small><small>{total.records} formas de pagamento na fonte</small><span className="arena-link-label">Conferir PagVendas →</span></Link>)}</div>}
  </section>
}

export function BankStatementOverview() {
  const { user } = useAuth()
  const bank = useHistory(new URLSearchParams({ series: 'pagbank-conta' }))
  const external = useHistory(new URLSearchParams({ series: 'despesas-fora-pagbank', ...(bank.data?.month ? { month: bank.data.month } : {}) }))
  if (!user?.roles.includes('Owner')) return null
  const rows = bank.data?.totals.filter(x => x.series === 'pagbank-conta') ?? []
  if (!rows.length && !bank.isError) return null
  const cards = [
    { label: 'Entradas no extrato PagBank', series: 'pagbank-conta', metric: 'entradas-extrato', rows: rows.filter(x => x.metric === 'entradas-extrato') },
    { label: 'Saídas no extrato PagBank', series: 'pagbank-conta', metric: 'saidas-extrato', rows: rows.filter(x => x.metric === 'saidas-extrato') },
    { label: 'Despesas pagas fora do PagBank', series: 'despesas-fora-pagbank', metric: 'despesas', rows: external.data?.month === bank.data?.month ? external.data?.totals.filter(x => x.series === 'despesas-fora-pagbank' && x.metric === 'despesas') ?? [] : [] },
  ]
  return <section className="arena-dashboard-section" aria-labelledby="bank-statement-title">
    <div className="arena-section-heading"><h2 id="bank-statement-title">Extrato bancário e despesas externas</h2></div>
    {bank.isError && <p role="alert">Não foi possível atualizar o extrato bancário.</p>}
    {external.isError && <p role="alert">Não foi possível atualizar as despesas externas.</p>}
    <div className="arena-metric-grid">{cards.filter(card => card.rows.length).map(card => <Link className="arena-metric" key={card.series + card.metric} to={`/financeiro/historico?${new URLSearchParams({ series: card.series, metric: card.metric, month: bank.data!.month })}`}>
      <span className="arena-metric-label">{card.label}</span><strong>{centsMoney(Math.abs(card.rows.reduce((sum, row) => sum + row.amountCents, 0)))}</strong>
      <small>{monthLabel(bank.data!.month)} · {card.rows.reduce((sum, row) => sum + row.records, 0)} registros</small><span className="arena-link-label">Conferir movimentos e origem →</span>
    </Link>)}</div>
    <p className="arena-hint">As entradas e saídas são movimentos da conta. As despesas externas foram pagas por outro meio. Estes detalhes podem estar incluídos no consolidado mensal; não devem ser somados a ele novamente. O saldo da conta é apresentado separadamente, com sua data e origem.</p>
  </section>
}

export function FinancialHistoryPage() {
  const { user } = useAuth(); const [params, setParams] = useSearchParams(); const query = useHistory(params)
  const integrations = useQuery({ queryKey: ['financial-integrations', user?.id], queryFn: () => apiFetch<Integration[]>('/api/v1/financial-history/integrations'), enabled: Boolean(user?.roles.includes('Owner')), refetchInterval: 60_000 })
  const [open, setOpen] = useState<string | null>(null)
  if (!user?.roles.includes('Owner')) return <main className="operation-page arena-page"><p role="alert">Histórico disponível apenas para os proprietários.</p></main>
  const report = query.data; const page = report?.page ?? 1; const source=report?.items.find(item=>item.id===open)
  const change = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); next.delete('page'); setParams(next) }
  return <main className="operation-page arena-page">
    <header className="page-heading"><div><p className="eyebrow">GESTÃO DOS PROPRIETÁRIOS</p><h1>Histórico financeiro</h1><p>Consulte vendas do bar, despesas, alunos, mensalistas e saldos com a origem de cada valor.</p></div><Link to="/">Voltar ao dashboard</Link></header>
    <div className="compact-filters"><label className="operation-field">Competência<select value={params.get('month') ?? report?.month ?? ''} onChange={e => change('month', e.target.value)}>{report?.months.map(month => <option key={month} value={month}>{monthLabel(month)}</option>)}</select></label><label className="operation-field">Controle<select value={params.get('series') ?? ''} onChange={e => { const next = new URLSearchParams(params); next.delete('metric'); next.delete('page'); if (e.target.value) next.set('series', e.target.value); else next.delete('series'); setParams(next) }}><option value="">Todos os controles, separados</option>{Object.entries(seriesLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
    <p className="arena-hint">Totais separados por controle e competência. As fontes podem se sobrepor.</p><Disclosure title="Como interpretar estes valores"><p>Resumos, compras, pagamentos e saldos têm finalidades diferentes e não devem ser somados entre si. A competência mensal não informa o dia do recebimento. Saldos mostram uma fotografia da data indicada.</p></Disclosure>
    {query.isPending && <p role="status">Carregando histórico…</p>}{query.isError && <p role="alert" className="arena-message arena-error">Não foi possível carregar o histórico. <button type="button" onClick={()=>void query.refetch()}>Tentar novamente</button></p>}
    {report && <><div className="arena-metric-grid">{report.totals.map(total => <article className="arena-metric" key={`${total.series}:${total.metric}:${total.state}:${total.period}:${total.grain}`}><span className="arena-metric-label">{seriesLabels[total.series]}</span><strong>{centsMoney(total.amountCents)}</strong><small>{metrics[total.metric] ?? total.metric} · {total.state}</small><small>{total.records} registros · {total.grain === 'snapshot' ? total.period.split('-').reverse().join('/') : monthLabel(total.period)}</small></article>)}</div>
      <h2>Registros de origem</h2><p>{report.total} valores neste filtro.</p>
      <RecordTable label="Registros financeiros de origem" columns={['Descrição','Controle','Período / data','Estado na fonte','Valor','Origem']} rows={report.items.map(item=>({key:item.id,cells:[item.data.label,seriesLabels[item.data.series],<>{item.data.grain==='month'||item.data.grain==='estimate'?monthLabel(item.data.periodStart.slice(0,7)):item.data.periodStart.split('-').reverse().join('/')} {item.data.grain==='estimate'&&'· Referência'}</>,item.data.state,centsMoney(item.data.amountCents),<button type="button" aria-label={`Ver origem de ${item.data.label}`} onClick={()=>setOpen(item.id)}>Ver origem</button>]}))}/>
      {source&&<ModalPanel title="Origem do valor" onClose={()=>setOpen(null)}><div className="editor-body"><h3>{source.data.label} · {centsMoney(source.data.amountCents)}</h3><p>{source.sourceName}</p><p><strong>Referência:</strong> {source.data.sourceCell}</p><p>{source.data.notes}</p><Disclosure title="Identificação do arquivo"><code className="source-hash">SHA-256: {source.sourceSha256}</code></Disclosure></div></ModalPanel>}
      {!report.items.length && <p>Nenhum registro disponível neste filtro.</p>}<div className="arena-actions"><button type="button" disabled={page === 1} onClick={() => { const next = new URLSearchParams(params); next.set('page', String(page - 1)); setParams(next) }}>Anterior</button><span>Página {page}</span><button type="button" disabled={page * 50 >= report.total} onClick={() => { const next = new URLSearchParams(params); next.set('page', String(page + 1)); setParams(next) }}>Próxima</button></div></>}
    <Disclosure title="Documentos originais do PagBank" lazy><PagBankDocuments /></Disclosure><section className="foundation-card source-status"><h2>Atualização das fontes</h2>{integrations.isError && <p role="alert">Não foi possível conferir as integrações.</p>}{integrations.data?.map(item => <article key={item.provider}><h3>{item.provider} · {item.state}</h3><p>Última leitura concluída: {item.lastSuccessUtc ? new Date(item.lastSuccessUtc).toLocaleString('pt-BR') : 'Aguardando configuração'}{item.completeThrough && ` · Completo até ${item.completeThrough}`}</p>{item.failureCode && <p role="alert">Falha: {item.failureCode}</p>}<Disclosure title="Detalhes da atualização"><p>{item.detail}</p></Disclosure></article>)}<Link to="/importacoes">Conferir e aplicar novos arquivos</Link></section>
  </main>
}


type ProviderReport = { date: string | null; dates: string[]; total: number; page: number; items: { movement: string; date: string; sourcePage: number; sourceSha256: string; data: Record<string, unknown> }[] }
function PagBankDocuments() {
  const { user } = useAuth(); const [date, setDate] = useState(''); const [page, setPage] = useState(1)
  const query = useQuery({ queryKey: ['pagbank-documents', user?.id, date, page], queryFn: () => apiFetch<ProviderReport>(`/api/v1/financial-history/pagbank-edi?${new URLSearchParams({ ...(date ? { date } : {}), page: String(page) })}`), enabled: Boolean(user?.roles.includes('Owner')), refetchInterval: 60_000 })
  const report = query.data
  return <section className="foundation-card"><h2>Movimentos originais da API PagBank</h2><p>Documentos completos de vendas, liquidações, transferências e saldos. Os eventos permanecem separados; consulte os valores e códigos originais de cada movimento.</p>
    {query.isPending && <p role="status">Consultando documentos…</p>}{query.isError && <p role="alert">Não foi possível consultar os documentos PagBank.</p>}
    {report && <>{report.dates.length ? <label className="arena-field">Data da API<select value={date || report.date || ''} onChange={e => { setDate(e.target.value); setPage(1) }}>{report.dates.map(day => <option key={day} value={day}>{day.split('-').reverse().join('/')}</option>)}</select></label> : <p>Aguardando a primeira coleta com credenciais EDI.</p>}
      <p>{report.total} movimentos nesta data.</p>{report.items.map((item, index) => <details key={`${item.movement}:${item.sourcePage}:${index}`}><summary>{item.movement} · {item.date} · movimento {(page - 1) * 50 + index + 1}</summary><div className="table-scroll"><table><tbody>{Object.entries(item.data).map(([key, value]) => <tr key={key}><th>{key.replaceAll('_', ' ')}</th><td>{typeof value === 'object' ? JSON.stringify(value) : String(value ?? 'Não informado')}</td></tr>)}</tbody></table></div><p>Página de origem {item.sourcePage} · SHA-256: <code>{item.sourceSha256}</code></p></details>)}
      {report.total > 50 && <div className="arena-actions"><button disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page}</span><button disabled={page * 50 >= report.total} onClick={() => setPage(page + 1)}>Próxima</button></div>}</>}
  </section>
}
