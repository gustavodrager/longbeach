import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { Buffer } from 'node:buffer'
import { ReceivedInvoicesPage, type InvoiceData } from './ReceivedInvoicesPage'
const auth = vi.hoisted(() => ({ canBar: true }))
vi.mock('../auth/authContext', () => ({ useAuth: () => ({ user: { roles: auth.canBar ? ['Manager'] : ['Operations'], permissions: auth.canBar ? ['fiscal:invoices:manage', 'bar:purchases:manage'] : ['fiscal:invoices:manage'], requiresFirstAccess: false } }) }))
const data: InvoiceData = { accessKey: '1'.repeat(44), number: '123', series: '1', supplierTaxId: '12345678000195', supplierName: 'Fornecedor teste', recipientTaxId: '52247131000171', issuedAt: '2026-10-13T15:00:00Z', environment: 1, productsTotal: 48, freight: 4, discount: 2, total: 50, warnings: [], canCreatePurchase: true,
  items: [{ number: 1, code: '001', description: 'Água caixa', unit: 'CX', quantity: 2, unitPrice: 24, total: 48, discount: 2, freight: 4 }] }
const detail = { id: 'invoice', fileName: 'nota.xml', data, purchaseId: null, purpose: 'Unclassified', reviewVersion: 1 }
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
function setup(options: { warning?: boolean; duplicate?: boolean; failure?: boolean; canBar?: boolean } = {}) {
  const current = options.warning ? { ...data, warnings: ['Total exige conferência.'], canCreatePurchase: false } : data
  auth.canBar = options.canBar ?? true
  let linked = false
  let purpose = 'Unclassified'; let reviewVersion = 1
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const path = String(url)
    if (path.endsWith('/preview')) return options.failure ? new Response(JSON.stringify({ detail: 'A nota não pertence à Arena.' }), { status: 400 }) : response(current)
    if (path.endsWith('/classification')) { purpose = JSON.parse(String(init?.body)).purpose; reviewVersion++; return response({ ...detail, purpose, reviewVersion }) }
    if (path.endsWith('/purchase')) { linked = true; return response({ purchaseId: 'purchase' }) }
    if (path.endsWith('/choices')) return response({ suppliers: [], products: [{ id: 'product', name: 'Água', purchaseUnit: 'CX', stockUnit: 'un', conversionFactor: 12, version: 3 }] })
    if (init?.method === 'POST') return response({ invoice: { ...detail, data: current }, alreadyImported: options.duplicate ?? false })
    if (path.endsWith('/invoice')) return response({ ...detail, data: current, purpose, reviewVersion, purchaseId: linked ? 'purchase' : null })
    return response({ items: [], total: 0 })
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter><ReceivedInvoicesPage/></MemoryRouter></QueryClientProvider>)
  return { fetch, client }
}
afterEach(() => vi.restoreAllMocks())
async function preview() {
  fireEvent.change(screen.getByLabelText('Arquivo XML da nota'), { target: { files: [new File(['<xml/>'], 'nota.xml', { type: 'application/xml' })] } })
  fireEvent.click(screen.getByRole('button', { name: 'Conferir arquivo' }))
  await screen.findByRole('heading', { name: 'NF-e 123 · série 1' })
}
it('separates preview, import and confirmed purchase; shows conversion and never receives stock', async () => {
  const { fetch, client } = setup()
  await preview()
  expect(screen.getByText(/12\.345\.678\/0001-95/)).toBeInTheDocument()
  expect(screen.getByText(/Destinatário: 52\.247\.131\/0001-71 · Emissão: 13\/10\/2026/)).toBeInTheDocument()
  expect(screen.getByText(data.accessKey)).toBeInTheDocument()
  expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  expect(screen.getByText(/situação atual na SEFAZ ainda não verificadas/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nota para conferência' }))
  await screen.findByLabelText('Finalidade da nota')
  expect(screen.queryByLabelText('Produto para o item 1')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Finalidade da nota'), { target: { value: 'Bar' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar classificação' }))
  await screen.findByLabelText('Produto para o item 1')
  expect(screen.getByRole('button', { name: 'Criar compra conferida' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Produto para o item 1'), { target: { value: 'product' } })
  fireEvent.change(screen.getByLabelText('Quantidade do item 1 em CX'), { target: { value: '2' } })
  expect(screen.getByText('Ao receber toda a compra: 24 un no estoque.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: 'Criar compra conferida' }))
  await screen.findByText(/Compra vinculada/)
  const writes = fetch.mock.calls.filter(([, init]) => init?.method === 'POST')
  expect(writes).toHaveLength(4)
  expect(JSON.parse(String(writes[3][1]?.body))).toEqual({ supplierId: '00000000-0000-0000-0000-000000000000', items: [{ lineNumber: 1, productId: 'product', productVersion: 3, purchaseQuantity: 2 }], confirmed: true, reviewVersion: 2 })
  expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/receive'))).toBe(false)
  client.clear()
})
it('reports duplicate and blocks generation for a note with fiscal warnings', async () => {
  const { client } = setup({ warning: true, duplicate: true }); await preview()
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nota para conferência' }))
  await screen.findByText('Esta nota já estava importada. Nenhuma duplicata foi criada.')
  expect(screen.queryByRole('button', { name: 'Criar compra conferida' })).not.toBeInTheDocument()
  expect(screen.getByText('Total exige conferência.')).toBeInTheDocument(); client.clear()
})
it('changing files clears the previous preview and rejected recipient cannot be saved', async () => {
  const { fetch, client } = setup(); await preview()
  fireEvent.change(screen.getByLabelText('Arquivo XML da nota'), { target: { files: [new File(['x'], 'arquivo.pdf')] } })
  expect(screen.queryByRole('button', { name: 'Salvar nota para conferência' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Conferir arquivo' }))
  await screen.findByRole('alert')
  expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1); client.clear()
})
it('shows server validation errors and does not save the rejected file', async () => {
  const { fetch, client } = setup({ failure: true })
  fireEvent.change(screen.getByLabelText('Arquivo XML da nota'), { target: { files: [new File(['x'], 'nota.xml')] } })
  fireEvent.click(screen.getByRole('button', { name: 'Conferir arquivo' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('A nota não pertence à Arena.'))
  expect(screen.queryByRole('button', { name: 'Salvar nota para conferência' })).not.toBeInTheDocument()
  expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1); client.clear()
})

it.each([
  ['Materials', 'Materiais de consumo'], ['Equipment', 'Equipamentos e patrimônio'],
  ['Maintenance', 'Manutenção e melhorias'], ['Other', 'Outras compras e despesas'], ['Mixed', 'Compra mista — várias finalidades'],
])('classifies %s without creating bar purchases', async (purpose, label) => {
  const { fetch, client } = setup(); await preview()
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nota para conferência' }))
  await screen.findByLabelText('Finalidade da nota')
  fireEvent.change(screen.getByLabelText('Finalidade da nota'), { target: { value: purpose } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar classificação' }))
  await screen.findByText('Classificação salva: ' + label)
  expect(screen.queryByRole('button', { name: 'Criar compra conferida' })).not.toBeInTheDocument()
  expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/choices') || String(url).endsWith('/purchase'))).toBe(false)
  const saved = fetch.mock.calls.find(([url]) => String(url).endsWith('/classification'))!
  expect(JSON.parse(String(saved[1]?.body))).toEqual({ purpose, reviewVersion: 1 })
  fireEvent.change(screen.getByLabelText('Filtrar por finalidade'), { target: { value: purpose } })
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).includes('page=1&purpose=' + purpose))).toBe(true))
  client.clear()
})
it('bloqueia notas ao atendente mesmo com claims fiscais antigas', () => {
  const { fetch, client } = setup({ canBar: false })
  expect(screen.getByRole('heading', { name: 'Acesso restrito' })).toBeInTheDocument()
  expect(screen.queryByLabelText('Arquivo XML da nota')).not.toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled(); client.clear()
})

const pastedXml = '<?xml version="1.0" encoding="UTF-8"?>\n<nfeProc><xNome>Fornecedor fictício &amp; Cia</xNome></nfeProc>'
function pasteXml(xml = pastedXml) {
  fireEvent.change(screen.getByLabelText('Como enviar o XML'), { target: { value: 'paste' } })
  fireEvent.change(screen.getByLabelText('Nome original do arquivo XML'), { target: { value: 'anexo-teste.xml' } })
  fireEvent.change(screen.getByLabelText('Conteúdo do XML'), { target: { value: xml } })
  fireEvent.click(screen.getByRole('button', { name: 'Conferir XML' }))
}

it.each([false, true])('envia XML colado sem reescrever o conteúdo e usa a mesma prévia e confirmação de importação (duplicada=%s)', async duplicate => {
  const { fetch, client } = setup({ duplicate })
  pasteXml()
  await screen.findByRole('heading', { name: 'NF-e 123 · série 1' })
  const previewWrites = fetch.mock.calls.filter(([, init]) => init?.method === 'POST')
  expect(previewWrites).toHaveLength(1)
  expect(previewWrites[0][0]).toBe('/api/v1/received-invoices/preview')
  const upload = JSON.parse(String(previewWrites[0][1]?.body))
  expect(upload.fileName).toBe('anexo-teste.xml')
  expect(Buffer.from(upload.contentBase64, 'base64').toString('utf8')).toBe(pastedXml)
  expect(screen.queryByRole('button', { name: 'Criar compra conferida' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nota para conferência' }))
  await screen.findByText(duplicate ? 'Esta nota já estava importada. Nenhuma duplicata foi criada.' : 'Nota salva para conferência.')
  const writes = fetch.mock.calls.filter(([, init]) => init?.method === 'POST')
  expect(writes).toHaveLength(2)
  expect(writes[1][0]).toBe('/api/v1/received-invoices/')
  expect(JSON.parse(String(writes[1][1]?.body))).toEqual(upload)
  expect(fetch.mock.calls.some(([url]) => /\/(purchase|receive|payments)$/.test(String(url)))).toBe(false)
  client.clear()
})

it.each(['Nome original do arquivo XML', 'Conteúdo do XML'])('descarta a prévia anterior quando a colagem muda: %s', async field => {
  const { fetch, client } = setup()
  pasteXml()
  await screen.findByRole('button', { name: 'Salvar nota para conferência' })
  fireEvent.change(screen.getByLabelText(field), { target: { value: field === 'Conteúdo do XML' ? pastedXml + '\n' : 'outro-anexo.xml' } })
  expect(screen.queryByRole('button', { name: 'Salvar nota para conferência' })).not.toBeInTheDocument()
  expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  client.clear()
})

it('mantém os erros do validador fiscal para XML colado e não oferece salvamento', async () => {
  const { fetch, client } = setup({ failure: true })
  pasteXml()
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('A nota não pertence à Arena.'))
  expect(screen.queryByRole('button', { name: 'Salvar nota para conferência' })).not.toBeInTheDocument()
  expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  client.clear()
})

it.each([
  ['<?xml version="1.0" encoding="ISO-8859-1"?><nfeProc/>', 'A colagem aceita XML em UTF-8.'],
  ['á'.repeat(1024 * 1024 + 1), 'Informe um XML de até 2 MB'],
])('recusa colagem com codificação incompatível ou tamanho em bytes acima do limite', async (xml, error) => {
  const { fetch, client } = setup()
  pasteXml(xml)
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(error))
  expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  expect(screen.queryByRole('button', { name: 'Salvar nota para conferência' })).not.toBeInTheDocument()
  client.clear()
})
