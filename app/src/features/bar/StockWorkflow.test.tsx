import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../auth/authContext'
import { BarStockPage, BarCountsPage, BarLossesPage } from './StockPages'
import type { StockCount } from './StockCounts'
const auth={user:{id:'owner',name:'Teste',email:'test@example.invalid',roles:['Owner' as const],permissions:[]},isBootstrapping:false,signIn:async()=>{},signInWithGoogle:async()=>{},signOut:async()=>{},changePassword:async()=>{},completeFirstAccessWithGoogle:async()=>{}}
const products=Array.from({length:23},(_,i)=>({id:`p${i}`,name:`Produto ${String(i).padStart(2,'0')}`,saleUnit:'un',active:true,controlsStock:true,minimumStock:2}))
const balances=products.map((p,i)=>({...p,productId:p.id,locationId:'bar',unit:'un',quantity:i===0?0:5,reserved:1,available:i===0?0:4,low:i===0,alertEligible:true}))
function response(body:unknown){return new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}})}
function setup(child:React.ReactNode,path='/bar/estoque',countOverride?:StockCount){
 let count:StockCount=countOverride??{id:'count',locationId:'bar',state:'Counting',initial:false,items:products.map(p=>({productId:p.id,theoretical:5,counted:null}))}
 const api=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
  const url=String(input)
  if(init?.method==='PUT'){const body=JSON.parse(String(init.body));count={...count,items:count.items.map(i=>i.productId===body.productId?{...i,counted:body.quantity}:i)};return response(count)}
  if(init?.method==='POST')return response({id:'saved'})
  if(url.endsWith('/stock/locations'))return response([{id:'warehouse',name:'Anterior'},{id:'bar',name:'Bar'}])
  if(url.endsWith('/stock/balances'))return response([...balances,{productId:'inactive',locationId:'bar',name:'Produto antigo',unit:'kg',active:false,controlsStock:true,quantity:2,reserved:0,available:2}])
  if(url.endsWith('/catalog'))return response(products)
  if(url.endsWith('/counts'))return response([count])
  if(url.includes('/stock/movement-history?'))return response({items:[{id:'m',name:'Produto 01',locationName:'Bar',unit:'un',quantity:-1,before:5,after:4,kind:'Loss',reason:'Quebra fictícia',createdAtUtc:'2026-10-19T12:00:00Z',originId:'example'}],page:1,pageSize:20,total:1})
  return response([])
 })
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter initialEntries={[path]}><AuthContext.Provider value={auth}>{child}</AuthContext.Provider></MemoryRouter></QueryClientProvider>)
 return api
}
afterEach(()=>vi.restoreAllMocks())
it('preserva o filtro antigo e permite sair dele; distingue esgotados de disponíveis',async()=>{
 setup(<BarStockPage/>,'/bar/estoque?low=1')
 expect(await screen.findByRole('table',{name:'Saldos do estoque'})).toHaveTextContent('Produto 00')
 expect(screen.getByRole('table',{name:'Saldos do estoque'})).not.toHaveTextContent('Produto 01')
 await userEvent.selectOptions(screen.getByLabelText('Disponibilidade'),'available')
 expect(screen.getByRole('table',{name:'Saldos do estoque'})).toHaveTextContent('Produto 01')
 expect(screen.getByRole('table',{name:'Saldos do estoque'})).not.toHaveTextContent('Produto 00')
})
it('consulta histórico do Bar e envia filtros ao servidor, bloqueando período inválido',async()=>{
 const api=setup(<BarStockPage/>,'/bar/estoque?secao=movimentos')
 expect(await screen.findByText('5 → 4 un')).toBeInTheDocument()
 expect(api.mock.calls.some(([u])=>String(u).includes('locationId=bar'))).toBe(true)
 await userEvent.selectOptions(screen.getByLabelText('Local do histórico'),'all')
 await waitFor(()=>expect(api.mock.calls.filter(([u])=>String(u).includes('movement-history')).at(-1)?.[0]).not.toContain('locationId='))
 await userEvent.type(screen.getByLabelText('De'),'2026-10-20')
 await userEvent.type(screen.getByLabelText('Até'),'2026-10-19')
 expect(await screen.findByRole('alert')).toHaveTextContent('Confira as datas')
 expect(screen.queryByRole('table',{name:'Movimentações do estoque'})).not.toBeInTheDocument()
})
it('guia contagem por produto, salva zero e mantém progresso sem alterar estoque',async()=>{
 const api=setup(<BarCountsPage/>,'/bar/inventario');const u=userEvent.setup()
 await u.click(await screen.findByRole('button',{name:'Continuar contagem'}))
 const dialog=screen.getByRole('dialog')
 expect(within(dialog).getAllByRole('button',{name:/^Contar Produto/})).toHaveLength(10)
 expect(within(dialog).getByRole('button',{name:'Revisar ajustes'})).toBeDisabled()
 await u.type(within(dialog).getByLabelText('Buscar na contagem'),'Produto 22')
 await u.click(within(dialog).getByRole('button',{name:'Contar Produto 22'}))
 await u.type(within(dialog).getByLabelText('Contagem física'),'0')
 await u.click(within(dialog).getByRole('button',{name:'Salvar contagem'}))
 expect(await within(dialog).findByText('1 de 23 contados')).toBeInTheDocument()
 expect(api.mock.calls.some(([url,init])=>String(url).endsWith('/approve')&&init?.method==='POST')).toBe(false)
 const save=api.mock.calls.find(([,init])=>init?.method==='PUT')
 expect(JSON.parse(String(save?.[1]?.body))).toEqual({productId:'p22',quantity:0})
})
it('mostra diferenças e exige revisão antes de aprovar inventário completo',async()=>{
 const api=setup(<BarCountsPage/>,'/bar/inventario',{id:'count',locationId:'bar',state:'Counting',initial:false,items:[{productId:'p1',theoretical:5,counted:3}]})
 await userEvent.click(await screen.findByRole('button',{name:'Continuar contagem'}))
 expect(screen.queryByRole('button',{name:'Aprovar e gerar ajustes'})).not.toBeInTheDocument()
 await userEvent.click(screen.getByRole('button',{name:'Revisar ajustes'}))
 expect(screen.getByRole('table',{name:'Ajustes propostos'})).toHaveTextContent('-2 un')
 await userEvent.type(screen.getByLabelText('Justificativa da aprovação'),'Conferência física')
 await userEvent.click(screen.getByRole('button',{name:'Aprovar e gerar ajustes'}))
 await waitFor(()=>expect(api.mock.calls.some(([url,init])=>String(url).endsWith('/counts/count/approve')&&init?.method==='POST')).toBe(true))
})
it('bloqueia saída acima do disponível e exige conferir antes de registrar',async()=>{
 const api=setup(<BarLossesPage/>,'/bar/perdas');const u=userEvent.setup()
 await u.click(screen.getByRole('button',{name:'Registrar saída'}));const dialog=screen.getByRole('dialog')
 await u.selectOptions(within(dialog).getByLabelText('Produto'),'p1')
 await u.type(within(dialog).getByLabelText('Quantidade'),'5')
 await u.type(within(dialog).getByLabelText('Motivo e responsável pelo consumo'),'Quebra conferida')
 expect(within(dialog).getByRole('button',{name:'Conferir saída'})).toBeDisabled()
 await u.clear(within(dialog).getByLabelText('Quantidade'));await u.type(within(dialog).getByLabelText('Quantidade'),'1')
 await u.click(within(dialog).getByRole('button',{name:'Conferir saída'}))
 expect(within(dialog).getByText('Disponível: 4 → 3 un')).toBeInTheDocument()
 expect(api.mock.calls.some(([,init])=>init?.method==='POST')).toBe(false)
 await u.click(within(dialog).getByRole('button',{name:'Registrar saída'}))
 expect(await within(dialog).findByText('Saída registrada. O saldo foi atualizado.')).toBeInTheDocument()
 const write=api.mock.calls.find(([,init])=>init?.method==='POST')
 expect(JSON.parse(String(write?.[1]?.body))).toMatchObject({productId:'p1',locationId:'bar',quantity:1})
})

it('identifica produto inativo de uma contagem antiga pelo nome e unidade do estoque',async()=>{
 setup(<BarCountsPage/>,'/bar/inventario',{id:'count',locationId:'bar',state:'Counting',initial:false,items:[{productId:'inactive',theoretical:2,counted:null}]})
 await userEvent.click(await screen.findByRole('button',{name:'Continuar contagem'}))
 await userEvent.click(await screen.findByRole('button',{name:'Contar Produto antigo'}))
 expect(screen.getByRole('heading',{name:'Produto antigo'})).toBeInTheDocument()
 expect(screen.getByText('Físico registrado na abertura: 2 kg')).toBeInTheDocument()
})
