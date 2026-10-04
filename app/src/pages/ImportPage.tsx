import { useEffect, useState, type ChangeEvent } from 'react'
import { ApiError, apiFetch } from '../lib/http'
import { useAuth } from '../features/auth/authContext'

type StagedBatch = { id: string; sourceName: string; sourceSha256: string; status: string; rowCount: number; createdAtUtc: string }
type ImportPackage = { sourceName: string; sourceSha256: string; records: Array<{ sheetName: string; rowNumber: number; recordType: string; externalId?: string | null; data: unknown }> }

export function ImportPage() {
  const { user } = useAuth()
  const [batches, setBatches] = useState<StagedBatch[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const canImport = user?.roles.includes('Owner') ?? false

  async function load() {
    try { setBatches(await apiFetch<StagedBatch[]>('/api/v1/imports')) }
    catch (error) { setMessage(error instanceof ApiError && error.status === 403 ? 'Esta área está disponível apenas para o proprietário.' : 'Não foi possível consultar os lotes de importação.') }
  }

  useEffect(() => { if (canImport) void load() }, [canImport])

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const inputElement = event.currentTarget
    const file = event.currentTarget.files?.[0]
    if (!file) return
    setBusy(true); setMessage('')
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
        {batches.length === 0 ? <p>Nenhum lote foi carregado.</p> : batches.map((batch) => <article className="import-batch" key={batch.id}><div><strong>{batch.sourceName}</strong><span>{batch.rowCount} linhas · {batch.status === 'NeedsReview' ? 'Pendente de conferência' : batch.status}</span></div><code>{batch.sourceSha256}</code></article>)}
      </section>
    </>}
  </main>
}
