import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../lib/http'
import { useAuth } from '../auth/authContext'
import { hasPermission } from '../auth/access'
import { Heading } from '../../pages/arenaUi'
import './receivedInvoices.css'

const root = '/api/v1/received-invoices'
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const quantity = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
type Line = { number: number; code: string; description: string; unit: string; quantity: number; unitPrice: number; total: number; discount: number; freight: number }
export type InvoiceData = { accessKey: string; number: string; series: string; supplierTaxId: string; supplierName: string; recipientTaxId: string; issuedAt: string; environment: number; productsTotal: number; freight: number; discount: number; total: number; items: Line[]; warnings: string[]; canCreatePurchase: boolean }
type Detail = { id: string; fileName: string; data: InvoiceData; purchaseId: string | null; purpose: string; reviewVersion: number }
type Upload = { fileName: string; contentBase64: string }
type Row = { id: string; number: string; supplierName: string; total: number; purchaseId: string | null; purpose: string }
type Product = { id: string; name: string; purchaseUnit: string; stockUnit: string; conversionFactor: number; version: number }
type Choices = { suppliers: { id: string; name: string; taxId: string | null }[]; products: Product[] }
const purposes: Record<string, string> = { Unclassified: 'A classificar', Bar: 'Mercadorias do bar', Materials: 'Materiais de consumo', Equipment: 'Equipamentos e patrimônio', Maintenance: 'Manutenção e melhorias', Other: 'Outras compras e despesas', Mixed: 'Compra mista — várias finalidades' }
const emptyId = '00000000-0000-0000-0000-000000000000'

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'))
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.readAsDataURL(file)
  })
}

function InvoiceSummary({ data }: { data: InvoiceData }) {
  return <section className="operation-card invoice-summary" aria-label="Detalhes da nota">
    <h2>NF-e {data.number} · série {data.series}</h2>
    <p><strong>{data.supplierName}</strong> · {data.supplierTaxId}</p>
    <p>Destinatário: {data.recipientTaxId} · Emissão: {new Date(data.issuedAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
    <p className="invoice-key">Chave: {data.accessKey}</p>
    <p><strong>Total: {money(data.total)}</strong> · Produtos: {money(data.productsTotal)} · Frete: {money(data.freight)} · Desconto: {money(data.discount)}</p>
    <p className="arena-hint">Arquivo importado. Autenticidade da assinatura e situação atual na SEFAZ ainda não verificadas.{data.environment === 2 && ' Documento de homologação, sem valor fiscal.'}</p>
    {data.warnings.length > 0 && <div role="alert"><strong>Conferência específica necessária</strong><ul>{data.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}
    <div className="invoice-lines">{data.items.map(line => <article key={line.number}>
      <h3>{line.number}. {line.description}</h3><p>Código do fornecedor: {line.code}</p>
      <p>{quantity(line.quantity)} {line.unit} × {line.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 10 })} · Total bruto: {money(line.total)}</p>
      {(line.discount > 0 || line.freight > 0) && <p>Desconto: {money(line.discount)} · Frete: {money(line.freight)}</p>}
    </article>)}</div>
  </section>
}

function PurchaseReview({ invoice, onCreated }: { invoice: Detail; onCreated: () => Promise<void> }) {
  const choices = useQuery({ queryKey: ['invoice-choices'], queryFn: () => apiFetch<Choices>(root + '/choices') })
  const [mapping, setMapping] = useState<Record<number, { productId: string; amount: string }>>({})
  const [supplierId, setSupplierId] = useState(emptyId)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const complete = invoice.data.items.every(line => mapping[line.number]?.productId && Number(mapping[line.number].amount) > 0)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (lock.current || !confirmed || !complete || !choices.data) return
    lock.current = true; setBusy(true); setError('')
    try {
      const items = invoice.data.items.map(line => {
        const selection = mapping[line.number]
        const product = choices.data.products.find(item => item.id === selection.productId)!
        return { lineNumber: line.number, productId: product.id, productVersion: product.version, purchaseQuantity: Number(selection.amount) }
      })
      await apiFetch(root + '/' + invoice.id + '/purchase', { method: 'POST', body: JSON.stringify({ supplierId, items, confirmed, reviewVersion: invoice.reviewVersion }) })
      await onCreated()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível criar a compra.') }
    finally { lock.current = false; setBusy(false) }
  }
  return <section className="operation-card"><h2>Conferir e gerar compra do bar</h2>
    <p>Associe os produtos e informe a quantidade na unidade de compra do cadastro. Materiais, equipamentos e despesas devem permanecer para conferência em seu fluxo próprio.</p>
    {choices.isPending && <p role="status">Carregando fornecedores e produtos…</p>}
    {choices.isError && <p role="alert">Não foi possível carregar os cadastros. <button onClick={() => void choices.refetch()}>Tentar novamente</button></p>}
    {error && <p role="alert">{error}</p>}
    {choices.data && <form className="bar-form" onSubmit={event => void submit(event)}><fieldset disabled={busy} className="invoice-fieldset">
      <label className="bar-field">Fornecedor no sistema<select value={supplierId} onChange={event => { setSupplierId(event.target.value); setConfirmed(false) }}>
        <option value={emptyId}>Identificar por CPF/CNPJ ou cadastrar {invoice.data.supplierName}</option>
        {choices.data.suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}{supplier.taxId ? ` · ${supplier.taxId}` : ' · documento ainda não cadastrado'}</option>)}
      </select></label>
      {invoice.data.items.map(line => {
        const selection = mapping[line.number]
        const product = choices.data.products.find(item => item.id === selection?.productId)
        return <div className="invoice-mapping" key={line.number}><h3>{line.number}. {line.description}</h3><p>Na nota: {quantity(line.quantity)} {line.unit} · {money(line.total)}</p>
          <label className="bar-field">Produto para o item {line.number}<select required value={selection?.productId ?? ''} onChange={event => { setMapping(previous => ({ ...previous, [line.number]: { productId: event.target.value, amount: '' } })); setConfirmed(false) }}>
            <option value="">Selecione o produto correspondente</option>{choices.data.products.map(item => <option key={item.id} value={item.id}>{item.name} · compra em {item.purchaseUnit}</option>)}
          </select></label>
          {product && <><label className="bar-field">Quantidade do item {line.number} em {product.purchaseUnit}<input required type="number" min="0.001" step="0.001" value={selection?.amount ?? ''} onChange={event => { setMapping(previous => ({ ...previous, [line.number]: { productId: product.id, amount: event.target.value } })); setConfirmed(false) }}/></label>
            <p>Ao receber toda a compra: {quantity((Number(selection?.amount) || 0) * product.conversionFactor)} {product.stockUnit} no estoque.</p></>}
        </div>
      })}
      <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/> Conferi fornecedor, produtos, unidades e valores; esta nota corresponde à compra da Arena.</label>
      <p>A compra ficará aguardando recebimento. O pagamento permanece a definir.</p>
      <button disabled={!confirmed || !complete || busy}>{busy ? 'Criando compra…' : 'Criar compra conferida'}</button>
    </fieldset></form>}
  </section>
}

function Classification({ invoice, onSaved }: { invoice: Detail; onSaved: () => Promise<void> }) {
  const [purpose, setPurpose] = useState(invoice.purpose)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  async function save(event: FormEvent) {
    event.preventDefault()
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      await apiFetch(root + '/' + invoice.id + '/classification', { method: 'POST', body: JSON.stringify({ purpose, reviewVersion: invoice.reviewVersion }) })
      await onSaved()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a classificação.') }
    finally { lock.current = false; setBusy(false) }
  }
  return <section className="operation-card"><h2>Finalidade da compra</h2>
    <p>Classifique para que a Arena adquiriu estes itens. Uma mesma nota pode ter várias finalidades.</p>
    {invoice.purchaseId ? <p>Mercadorias do bar · classificação vinculada à compra já gerada.</p> : <form className="bar-form" onSubmit={event => void save(event)}>
      <label className="bar-field">Finalidade da nota<select disabled={busy} value={purpose} onChange={event => setPurpose(event.target.value)}>
        {Object.entries(purposes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <button disabled={busy || purpose === invoice.purpose}>{busy ? 'Salvando…' : 'Salvar classificação'}</button>
      {error && <p role="alert">{error} <button type="button" disabled={busy} onClick={() => void onSaved()}>Atualizar nota</button></p>}
    </form>}
    <p role="status">Classificação salva: {purposes[invoice.purpose]}</p>
    {invoice.purpose === 'Unclassified' && <p>Escolha a finalidade antes de encaminhar a compra.</p>}
    {invoice.purpose === 'Mixed' && <p>Nota mista guardada para conferência. Separe as finalidades por item antes de registrar compras ou despesas nos respectivos controles; esta nota não gera uma compra integral do bar.</p>}
    {!['Unclassified', 'Bar', 'Mixed'].includes(invoice.purpose) && <p>Nota guardada e classificada para a Arena. O lançamento financeiro, o recebimento de materiais e o registro patrimonial devem ser feitos nos controles correspondentes. Esta classificação não cria esses registros automaticamente.</p>}
  </section>
}

export function ReceivedInvoicesPage() {
  const client = useQueryClient()
  const { user } = useAuth()
  const canCreateBarPurchase = hasPermission(user, 'bar:purchases:manage')
  const [purposeFilter, setPurposeFilter] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<{ upload: Upload; data: InvoiceData } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const lock = useRef(false)
  const list = useQuery({ queryKey: ['received-invoices', page, purposeFilter], queryFn: () => apiFetch<{ items: Row[]; total: number }>(root + '/?page=' + page + (purposeFilter ? '&purpose=' + purposeFilter : '')) })
  const detail = useQuery({ queryKey: ['received-invoice', selected], queryFn: () => apiFetch<Detail>(root + '/' + selected), enabled: selected !== null })
  async function run(action: () => Promise<void>) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); setMessage('')
    try { await action() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.') }
    finally { lock.current = false; setBusy(false) }
  }
  async function showPreview(event: FormEvent) {
    event.preventDefault()
    if (!file) return
    await run(async () => {
      setPreview(null); setSelected(null)
      if (file.size > 2 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.xml')) throw new Error('Selecione um arquivo XML de até 2 MB.')
      const upload = { fileName: file.name, contentBase64: await readFile(file) }
      const data = await apiFetch<InvoiceData>(root + '/preview', { method: 'POST', body: JSON.stringify(upload) })
      setPreview({ upload, data })
    })
  }
  async function save() {
    if (!preview) return
    await run(async () => {
      const result = await apiFetch<{ invoice: Detail; alreadyImported: boolean }>(root + '/', { method: 'POST', body: JSON.stringify(preview.upload) })
      setPreview(null); setSelected(result.invoice.id); setPage(1); setPurposeFilter('')
      client.setQueryData(['received-invoice', result.invoice.id], result.invoice)
      setMessage(result.alreadyImported ? 'Esta nota já estava importada. Nenhuma duplicata foi criada.' : 'Nota salva para conferência.')
      await client.invalidateQueries({ queryKey: ['received-invoices'] })
    })
  }
  async function download() {
    if (!selected) return
    await run(async () => {
      const data = await apiFetch<Upload>(root + '/' + selected + '/original')
      const bytes = Uint8Array.from(atob(data.contentBase64), c => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/xml' }))
      const link = document.createElement('a'); link.href = url; link.download = data.fileName; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    })
  }
  return <main className="operation-page arena-page received-invoices"><Heading title="Notas recebidas da Arena" description="Reúna as notas emitidas para o CNPJ da Arena e classifique a finalidade de cada compra." eyebrow="Financeiro"/>
    <p className="arena-hint">Captura automática pela SEFAZ aguardando certificado digital. Esta etapa aceita XML de NF-e de mercadorias de qualquer área da Arena. Notas de serviços (NFS-e) terão uma integração própria.</p>
    <form className="operation-card bar-form" onSubmit={event => void showPreview(event)}>
      <label className="bar-field">Arquivo XML da nota<input type="file" accept=".xml,application/xml,text/xml" disabled={busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setPreview(null); setSelected(null); setError(''); setMessage('') }}/></label>
      <button disabled={!file || busy}>{busy ? 'Processando…' : 'Conferir arquivo'}</button>
    </form>
    {error && <p role="alert" className="bar-error">{error}</p>}{message && <p role="status">{message}</p>}
    {preview && <><InvoiceSummary data={preview.data}/><button disabled={busy} onClick={() => void save()}>Salvar nota para conferência</button></>}
    {selected && detail.isPending && <p role="status">Carregando nota…</p>}
    {selected && detail.isError && <p role="alert">Não foi possível abrir a nota. <button onClick={() => void detail.refetch()}>Tentar novamente</button></p>}
    {selected && !detail.isError && detail.data && <><InvoiceSummary data={detail.data.data}/><button disabled={busy} onClick={() => void download()}>Baixar XML original</button>
      <Classification key={selected + ':' + detail.data.reviewVersion} invoice={detail.data} onSaved={async () => {
        await client.invalidateQueries({ queryKey: ['received-invoice', selected] }); await client.invalidateQueries({ queryKey: ['received-invoices'] })
      }}/>
      {detail.data.purchaseId ? <p role="status">Compra vinculada. {canCreateBarPurchase && <Link to={`/bar/compras?invoice=${detail.data.data.accessKey}`}>Abrir compras para conferir o recebimento</Link>}</p>
        : detail.data.purpose === 'Bar' && canCreateBarPurchase && detail.data.data.canCreatePurchase && <PurchaseReview key={selected + ':' + detail.data.reviewVersion} invoice={detail.data} onCreated={async () => {
          await client.invalidateQueries({ queryKey: ['received-invoice', selected] }); await client.invalidateQueries({ queryKey: ['received-invoices'] });
          await client.invalidateQueries({ queryKey: ['bar'] }); await client.invalidateQueries({ queryKey: ['invoice-choices'] })
        }}/>}</>}
    <section className="operation-card"><h2>Notas importadas</h2>
      <label className="bar-field">Filtrar por finalidade<select value={purposeFilter} disabled={busy} onChange={event => { setPurposeFilter(event.target.value); setPage(1) }}>
        <option value="">Todas as finalidades</option>{Object.entries(purposes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      {list.isPending && <p role="status">Carregando notas…</p>}
      {list.isError && <p role="alert">Não foi possível carregar as notas. <button onClick={() => void list.refetch()}>Tentar novamente</button></p>}
      {!list.isError && list.data && <>{list.data.items.length === 0 ? <p>Nenhuma nota nesta página.</p> : <ul className="invoice-list">{list.data.items.map(row => <li key={row.id}><button disabled={busy} onClick={() => { setSelected(row.id); setPreview(null); setError(''); setMessage('') }}>
        NF-e {row.number} · {row.supplierName} · {money(row.total)} · {purposes[row.purpose]}{row.purchaseId ? ' · Compra do bar vinculada' : ''}
      </button></li>)}</ul>}<nav aria-label="Páginas de notas"><button disabled={page === 1 || busy} onClick={() => setPage(page - 1)}>Anterior</button><span> Página {page} · {list.data.total} notas </span><button disabled={page * 25 >= list.data.total || busy} onClick={() => setPage(page + 1)}>Próxima</button></nav></>}
    </section>
  </main>
}
