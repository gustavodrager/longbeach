import { useEffect, useState, type ChangeEvent } from 'react'
import { ApiError, apiFetch } from '../lib/http'
import { useAuth } from '../features/auth/authContext'
import { centsMoney, seriesLabels, type HistoryPreview } from '../features/finance/FinancialHistory'
import { GradeImportReview } from '../features/arena/GradeImportReview'

type StagedBatch = { id: string; sourceName: string; sourceSha256: string; status: string; rowCount: number; createdAtUtc: string }
type ImportPackage = { sourceName: string; sourceSha256: string; records: Array<{ sheetName: string; rowNumber: number; recordType: string; externalId?: string | null; data: unknown }> }
type CatalogPreview = { batchId: string; sourceName: string; applied: boolean; confirmationToken: string; canApply: boolean; creates: number; matches: number; items: Array<{ code: string; name: string; category: string; salePrice: number; action: string; conflict: string | null }> }

export function ImportPage() {
  const { user } = useAuth()
  const [batches, setBatches] = useState<StagedBatch[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [catalogPreview, setCatalogPreview] = useState<CatalogPreview | null>(null)
  const [historyPreview, setHistoryPreview] = useState<HistoryPreview | null>(null)
  const canImport = user?.roles.includes('Owner') ?? false

  async function load() {
    try { setBatches(await apiFetch<StagedBatch[]>('/api/v1/imports')) }
    catch (error) { setMessage(error instanceof ApiError && error.status === 403 ? 'Esta área está disponível apenas para o proprietário.' : 'Não foi possível consultar os lotes de importação.') }
  }

  useEffect(() => { if (canImport) void load() }, [canImport])

  async function inspectCatalog(id: string) {
    setBusy(true); setMessage(''); setCatalogPreview(null); setHistoryPreview(null)
    try { setCatalogPreview(await apiFetch<CatalogPreview>(`/api/v1/imports/${id}/bar-catalog`)) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível conferir o catálogo.') }
    finally { setBusy(false) }
  }

  async function inspectHistory(id: string) {
    setBusy(true); setMessage(''); setHistoryPreview(null); setCatalogPreview(null)
    try { setHistoryPreview(await apiFetch<HistoryPreview>(`/api/v1/financial-history/imports/${id}`)) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível conferir o histórico.') }
    finally { setBusy(false) }
  }
  async function applyHistory() {
    if (!historyPreview) return
    setBusy(true); setMessage('')
    try {
      setHistoryPreview(await apiFetch<HistoryPreview>(`/api/v1/financial-history/imports/${historyPreview.batchId}/apply`, { method: 'POST', body: JSON.stringify({ confirmationToken: historyPreview.confirmationToken }) }))
      setMessage('Histórico aplicado ao painel dos proprietários. Cada valor mantém sua origem e estado informado na fonte.'); await load()
    } catch (error) { setHistoryPreview(null); setMessage(error instanceof Error ? error.message : 'Confira o histórico novamente.') }
    finally { setBusy(false) }
  }

  async function applyCatalog() {
    if (!catalogPreview?.canApply) return
    setBusy(true); setMessage('')
    try {
      const result = await apiFetch<CatalogPreview>(`/api/v1/imports/${catalogPreview.batchId}/bar-catalog/apply`, {
        method: 'POST', body: JSON.stringify({ confirmationToken: catalogPreview.confirmationToken }),
      })
      setCatalogPreview(result)
      setMessage('Catálogo conferido e aplicado ao bar. Estoque, custos dos produtos existentes e demais ajustes foram preservados.')
      await load()
    } catch (error) {
      setCatalogPreview(null)
      setMessage(error instanceof Error ? error.message : 'Não foi possível aplicar o catálogo. Confira novamente.')
    } finally { setBusy(false) }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const inputElement = event.currentTarget
    const file = event.currentTarget.files?.[0]
    if (!file) return
    setBusy(true); setMessage(''); setCatalogPreview(null); setHistoryPreview(null)
    try {
      const input = JSON.parse(await file.text()) as ImportPackage
      if (!input.sourceName || !input.sourceSha256 || !Array.isArray(input.records)) throw new Error('Arquivo de importação inválido.')
      const result = await apiFetch<{ rowCount: number; status: string; alreadyImported: boolean }>('/api/v1/imports', {
        method: 'POST', body: JSON.stringify(input),
      })
      setMessage(result.alreadyImported ? `Este arquivo já estava carregado: ${result.rowCount} linhas preservadas.` : `${result.rowCount} linhas foram guardadas para conferência. Nenhuma linha foi marcada como confirmada.`)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível enviar o lote.')
    } finally {
      setBusy(false); inputElement.value = ''
    }
  }

  return <main className="dashboard import-page">
    <header className="page-heading"><div><p className="eyebrow">DADOS E CONFERÊNCIA</p><h1>Importações</h1><p>Os arquivos ficam registrados com hash e origem antes de qualquer integração com os cadastros.</p></div></header>
    {!canImport ? <p role="alert">Esta área está disponível apenas para o proprietário.</p> : <>
      <section className="foundation-card import-card"><div><span className="card-kicker">Etapa segura</span><h2>Preparar lote para conferência</h2><p>Selecione um pacote JSON preparado a partir das planilhas. As linhas ficam em staging com a aba e o número original. Status, pagamentos e saldos não são confirmados nem lançados automaticamente.</p></div>
        <label className="button-primary import-picker">{busy ? 'Carregando lote…' : 'Selecionar pacote JSON'}<input aria-label="Selecionar pacote JSON" type="file" accept="application/json,.json" disabled={busy} onChange={(event) => void upload(event)} /></label>
      </section>
      {message && <p className="persistence-banner" role="status">{message}</p>}
      <section className="import-batches"><div className="section-heading"><div><p className="eyebrow">REGISTRO DE ORIGEM</p><h2>Lotes no PostgreSQL</h2></div><button type="button" onClick={() => void load()}>Atualizar</button></div>
        {batches.length === 0 ? <p>Nenhum lote foi carregado.</p> : batches.map((batch) => <article className="import-batch" key={batch.id}><div><strong>{batch.sourceName}</strong><span>{batch.rowCount} linhas · {batch.status === 'NeedsReview' ? 'Pendente de conferência' : batch.status === 'Applied' ? 'Aplicado' : batch.status}</span></div><code>{batch.sourceSha256}</code><button type="button" disabled={busy} onClick={() => void inspectCatalog(batch.id)} aria-label={`Conferir produtos do bar: ${batch.sourceName}`}>Conferir produtos do bar</button><button type="button" disabled={busy} onClick={() => void inspectHistory(batch.id)} aria-label={`Conferir histórico financeiro: ${batch.sourceName}`}>Conferir histórico financeiro</button><GradeImportReview batchId={batch.id} sourceName={batch.sourceName} onApplied={load} /></article>)}
      </section>
      {historyPreview && <section className="foundation-card" aria-label="Conferência financeira"><h2>Conferir histórico financeiro</h2><p>{historyPreview.sourceName} · {historyPreview.creates} valores novos · {historyPreview.matches} já aplicados.</p><p>Os totais de cada controle permanecem separados. Esta aplicação disponibiliza o histórico para os donos com o estado informado na fonte.</p><div className="table-scroll"><table><thead><tr><th>Controle</th><th>Indicador</th><th>Período</th><th>Estado</th><th>Registros</th><th>Total</th></tr></thead><tbody>{historyPreview.totals.map(total => <tr key={`${total.series}:${total.metric}:${total.state}:${total.period}:${total.grain}`}><td>{seriesLabels[total.series]}</td><td>{total.metric}</td><td>{total.period} · {total.grain}</td><td>{total.state}</td><td>{total.records}</td><td>{centsMoney(total.amountCents)}</td></tr>)}</tbody></table></div>{historyPreview.applied ? <p role="status">Histórico já aplicado.</p> : <button type="button" disabled={busy} onClick={() => void applyHistory()} className="button-primary">Aplicar histórico conferido</button>}</section>}
      {catalogPreview && <section className="foundation-card" aria-label="Conferência de produtos do bar">
        <h2>Conferir catálogo do bar</h2>
        <p>Arquivo: {catalogPreview.sourceName}</p>
        <p>{catalogPreview.creates} produtos novos · {catalogPreview.matches} já cadastrados. Produtos existentes não serão sobrescritos.</p>
        <p>As quantidades precisam ser conferidas no inventário. Fotos, receitas e custos calculados continuam no cadastro do bar.</p>
        <div className="table-scroll"><table><thead><tr><th>Código</th><th>Produto</th><th>Categoria</th><th>Preço</th><th>Conferência</th></tr></thead><tbody>
          {catalogPreview.items.map(item => <tr key={item.code}><td>{item.code}</td><td>{item.name}</td><td>{item.category}</td><td>{item.salePrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td><td>{item.conflict ?? (item.action === 'Create' ? 'Novo produto' : 'Já cadastrado')}</td></tr>)}
        </tbody></table></div>
        {catalogPreview.applied ? <p role="status">Lote já aplicado ao bar.</p> : <button type="button" className="button-primary" disabled={busy || !catalogPreview.canApply} onClick={() => void applyCatalog()}>{busy ? 'Aplicando…' : 'Aplicar catálogo conferido'}</button>}
      </section>}
    </>}
  </main>
}
