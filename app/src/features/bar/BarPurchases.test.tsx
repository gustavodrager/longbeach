import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { BarPurchasesPage } from './BarPages'

it('corrige a referência de compra recebida com versão e sem repetir recebimento',async()=>{
  const purchase={id:'purchase',version:3,document:'Nota teste',state:'Received',supplierId:'supplier',paymentMethod:'Pix',accountReference:'Proprietário teste',total:100,freight:0,discount:0,items:[{productId:'product',quantity:24,received:24,purchaseUnit:'un'}]}
  const response=(body:unknown)=>new Response(JSON.stringify(body))
  const api=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
    const path=String(input)
    if(init?.method==='POST')return response({...purchase,...JSON.parse(String(init.body)),version:4})
    if(path.endsWith('/purchases'))return response([purchase])
    if(path.endsWith('/suppliers'))return response([{id:'supplier',name:'Fornecedor teste'}])
    if(path.endsWith('/catalog'))return response([{id:'product',name:'Produto teste'}])
    return response([])
  })
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/bar/compras']}><BarPurchasesPage/></MemoryRouter></QueryClientProvider>)
  await screen.findByRole('heading',{name:'Nota teste · Recebida'})
  expect(screen.queryByRole('button',{name:'Receber produtos'})).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Corrigir conta ou forma de pagamento'}))
  fireEvent.change(screen.getByLabelText('Conta ou proprietário que pagou e referência do acerto'),{target:{value:'Conta da arena'}})
  fireEvent.click(screen.getByRole('button',{name:'Salvar referência do pagamento'}))
  await waitFor(()=>expect(api.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1))
  const write=api.mock.calls.find(([,init])=>init?.method==='POST')!
  expect(write[0]).toBe('/api/v1/bar/purchases/purchase/payment-reference')
  expect(JSON.parse(String(write[1]?.body))).toEqual({paymentMethod:'Pix',accountReference:'Conta da arena',version:3})
  client.clear();vi.restoreAllMocks()
})
