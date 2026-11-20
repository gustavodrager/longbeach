import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { BarPurchasesPage } from './BarPages'
import type { Purchase } from './purchaseModel'
vi.mock('../auth/authContext', () => ({ useAuth: () => ({ user: {id:'manager-fixture',name:'Gestor teste',email:'manager@example.invalid',roles:['Manager'],permissions:[]} }) }))

it('corrige a referência de compra recebida com versão e sem repetir recebimento',async()=>{
  const purchase={id:'purchase',version:3,document:'Nota teste',state:'Received',supplierId:'supplier',paymentMethod:'Pix',accountReference:'Proprietário teste',total:100,freight:0,discount:0,items:[{productId:'product',quantity:24,received:24,purchaseUnit:'un'}]}
  const response=(body:unknown)=>new Response(JSON.stringify(body))
  const api=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
    const path=String(input)
    if(init?.method==='POST')return response({...purchase,...JSON.parse(String(init.body)),version:4})
    if(path.includes('/purchases/history'))return response({items:[purchase],page:1,pageSize:20,total:1,awaiting:0,partial:0,completed:1})
    if(path.endsWith('/suppliers'))return response([{id:'supplier',name:'Fornecedor teste'}])
    if(path.endsWith('/purchases/products'))return response([{id:'product',name:'Produto teste'}])
    return response([])
  })
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/bar/compras']}><BarPurchasesPage/></MemoryRouter></QueryClientProvider>)
  await screen.findByRole('heading',{name:'Nota teste · Recebida'})
  expect(screen.queryByRole('button',{name:'Receber produtos'})).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Ver itens e pagamento'))
  fireEvent.click(screen.getByRole('button',{name:'Corrigir conta ou forma de pagamento'}))
  fireEvent.change(screen.getByLabelText('Conta ou proprietário que pagou e referência do acerto'),{target:{value:'Conta da arena'}})
  fireEvent.click(screen.getByRole('button',{name:'Salvar referência do pagamento'}))
  await waitFor(()=>expect(api.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1))
  const write=api.mock.calls.find(([,init])=>init?.method==='POST')!
  expect(write[0]).toBe('/api/v1/bar/purchases/purchase/payment-reference')
  expect(JSON.parse(String(write[1]?.body))).toEqual({paymentMethod:'Pix',accountReference:'Conta da arena',version:3})
  client.clear();vi.restoreAllMocks()
})

it('mantém o recebimento parcial após falha e reutiliza a chave da operação na tentativa seguinte',async()=>{
 const purchase={id:'partial',version:1,document:'Compra parcial',state:'PartiallyReceived',supplierId:'supplier',paymentMethod:'Pending',total:40,freight:0,discount:0,items:[{productId:'water',quantity:4,received:1,purchaseUnit:'caixa',conversion:12}]}
 let attempt=0
 const writes:any[]=[]
 const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status})
 const api=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
  const path=String(input)
  if(init?.method==='POST'){writes.push(JSON.parse(String(init.body)));return ++attempt===1?response({detail:'Falha temporária'},503):response({...purchase,state:'Received'})}
  if(path.includes('/purchases/history'))return response({items:[purchase],page:1,pageSize:20,total:1,awaiting:0,partial:1,completed:0})
  if(path.endsWith('/suppliers'))return response([{id:'supplier',name:'Fornecedor teste'}])
  if(path.endsWith('/purchases/products'))return response([{id:'water',name:'Água teste',purchaseUnit:'caixa',saleUnit:'un',conversionFactor:24,active:false}])
  if(path.endsWith('/stock/locations'))return response([{id:'bar',name:'Bar'}])
  return response([])
 })
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
 render(<QueryClientProvider client={client}><MemoryRouter><BarPurchasesPage/></MemoryRouter></QueryClientProvider>)
 fireEvent.click(await screen.findByRole('button',{name:'Receber produtos'}))
 const input=await screen.findByLabelText('Receber: Água teste')
 expect(input).toHaveValue('3')
 // Snapshot da compra mantém fator 12 mesmo que o catálogo tenha mudado para 24.
 expect(screen.getByText('Entrada: 36 un no estoque do Bar')).toBeInTheDocument()
 fireEvent.change(input,{target:{value:'4'}});expect(screen.getByRole('button',{name:'Confirmar quantidades recebidas agora'})).toBeDisabled()
 fireEvent.change(input,{target:{value:''}});expect(screen.getByRole('button',{name:'Confirmar quantidades recebidas agora'})).toBeDisabled()
 fireEvent.change(input,{target:{value:'1,5'}})
 fireEvent.click(screen.getByRole('button',{name:'Confirmar quantidades recebidas agora'}))
 await screen.findByRole('alert');expect(input).toHaveValue('1,5')
 fireEvent.click(screen.getByRole('button',{name:'Confirmar quantidades recebidas agora'}))
 await waitFor(()=>expect(writes).toHaveLength(2))
 expect(writes[0]).toEqual(writes[1]);expect(writes[0]).toMatchObject({locationId:'bar',items:[{productId:'water',quantity:1.5}]})
 client.clear();api.mockRestore()
})

function setupCanceledPurchase(conflict = false) {
  let purchase: Purchase = { id: 'canceled', version: 4, document: 'Nota teste de reabertura', state: 'Canceled', supplierId: 'supplier',
    purchasedAtUtc: '2025-03-10T01:00:00Z', paymentMethod: 'Pending', total: 36, freight: 0, discount: 0,
    items: [{ productId: 'water', quantity: 2, received: 0, purchaseUnit: 'cx', conversion: 12 }] }
  let attempts = 0
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
  const api = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input)
    if (path.endsWith('/reopen') && init?.method === 'POST') {
      if (conflict && ++attempts === 1) { purchase = { ...purchase, version: 5 }; return response({ detail: 'A compra foi alterada. Atualize e confira novamente.' }, 409) }
      const body = JSON.parse(String(init.body))
      purchase = { ...purchase, state: 'Ordered', purchasedAtUtc: body.purchasedAtUtc, version: purchase.version + 1 }
      return response(purchase)
    }
    if (path.endsWith('/purchases/canceled')) return response(purchase)
    if (path.includes('/purchases/history')) return response({ items: [purchase], page: 1, pageSize: 20, total: 1, awaiting: purchase.state === 'Ordered' ? 1 : 0, partial: 0, completed: 0 })
    if (path.endsWith('/suppliers')) return response([{ id: 'supplier', name: 'Fornecedor teste' }])
    if (path.endsWith('/purchases/products')) return response([{ id: 'water', name: 'Água teste', purchaseUnit: 'cx', saleUnit: 'un', conversionFactor: 12, active: true }])
    return response([])
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/bar/compras']}><BarPurchasesPage/></MemoryRouter></QueryClientProvider>)
  return { api, client }
}

async function openReopening() {
  await screen.findByRole('heading', { name: 'Nota teste de reabertura · Cancelada' })
  fireEvent.click(screen.getByText('Ver itens e pagamento'))
  fireEvent.click(screen.getByRole('button', { name: 'Reabrir compra cancelada' }))
  expect(screen.getByLabelText('Data correta da compra')).toHaveValue('2025-03-09')
  fireEvent.change(screen.getByLabelText('Data correta da compra'), { target: { value: '2025-03-07' } })
  fireEvent.change(screen.getByLabelText('Motivo da reabertura'), { target: { value: '  Corrigir a data da compra cancelada  ' } })
}

it('reabre a mesma compra com data correta, motivo e versão e mostra o estado confirmado sem receber ou pagar', async () => {
  const { api, client } = setupCanceledPurchase()
  await openReopening()
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar reabertura' }))
  await screen.findByRole('heading', { name: 'Compra reaberta' })
  expect(screen.getByText('Data da compra: 07/03/2025')).toBeInTheDocument()
  await screen.findByRole('heading', { name: 'Nota teste de reabertura · Comprada' })
  const writes = api.mock.calls.filter(([, init]) => init?.method === 'POST')
  expect(writes).toHaveLength(1)
  expect(writes[0][0]).toBe('/api/v1/bar/purchases/canceled/reopen')
  expect(JSON.parse(String(writes[0][1]?.body))).toEqual({ purchasedAtUtc: '2025-03-07T12:00:00-03:00', reason: 'Corrigir a data da compra cancelada', version: 4 })
  expect(screen.queryByRole('button', { name: 'Confirmar reabertura' })).not.toBeInTheDocument()
  expect(api.mock.calls.some(([url]) => /\/(receive|payment-reference|payments)$/.test(String(url)))).toBe(false)
  client.clear(); api.mockRestore()
})

it('preserva a correção após conflito e exige atualizar a compra antes de reenviar com a versão atual', async () => {
  const { api, client } = setupCanceledPurchase(true)
  await openReopening()
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar reabertura' }))
  await screen.findByRole('alert')
  expect(screen.getByLabelText('Data correta da compra')).toHaveValue('2025-03-07')
  expect(screen.getByLabelText('Motivo da reabertura')).toHaveValue('  Corrigir a data da compra cancelada  ')
  expect(screen.getByRole('button', { name: 'Confirmar reabertura' })).toBeDisabled()
  expect(api.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar compra' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar reabertura' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar reabertura' }))
  await screen.findByRole('heading', { name: 'Compra reaberta' })
  const writes = api.mock.calls.filter(([, init]) => init?.method === 'POST')
  expect(writes).toHaveLength(2)
  expect(JSON.parse(String(writes[1][1]?.body))).toEqual({ purchasedAtUtc: '2025-03-07T12:00:00-03:00', reason: 'Corrigir a data da compra cancelada', version: 5 })
  client.clear(); api.mockRestore()
})
