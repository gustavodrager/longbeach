import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { PurchaseForm } from './PurchaseForm'
import { decimal, rowTotal } from './purchaseModel'
vi.mock('../auth/authContext',()=>({useAuth:()=>({user:{id:'purchase-owner',roles:['Manager'],permissions:[]}})}))
const products=[{id:'water',name:'Água teste',code:'AG',purchaseUnit:'caixa',saleUnit:'un',conversionFactor:12,active:true},{id:'old',name:'Inativo',code:'OLD',purchaseUnit:'un',saleUnit:'un',conversionFactor:1,active:false}]
afterEach(()=>vi.restoreAllMocks())
function Fixture({onReceive}:{onReceive:(p:any)=>void}){const {data}=useQuery({queryKey:['bar','/suppliers'],queryFn:async()=>[{id:'supplier',name:'Distribuidora teste'}],initialData:[{id:'supplier',name:'Distribuidora teste'}],staleTime:Infinity});return <PurchaseForm products={products} suppliers={data} onClose={vi.fn()} onReceive={onReceive}/> }
function setup(){const client=new QueryClient({defaultOptions:{queries:{retry:false}}}),onReceive=vi.fn();render(<QueryClientProvider client={client}><MemoryRouter><Fixture onReceive={onReceive}/></MemoryRouter></QueryClientProvider>);return {client,onReceive}}
it('preserva itens ao cadastrar fornecedor e registra antes de abrir o recebimento',async()=>{
 const writes:{path:string;body:any}[]=[]
 vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{const path=String(input),body=JSON.parse(String(init?.body));writes.push({path,body});return new Response(JSON.stringify(path.endsWith('/suppliers')?{id:'new',name:'Novo fornecedor'}:{id:'purchase',document:body.document,total:30,items:body.items,state:'Ordered'}))})
 const {client,onReceive}=setup()
 expect(screen.queryByRole('button',{name:/Inativo/})).not.toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('Documento ou referência única da compra'),{target:{value:'Teste 01'}})
 fireEvent.click(screen.getByRole('button',{name:/Água teste/}))
 await waitFor(()=>expect(screen.getByLabelText('Quantidade: Água teste')).toHaveFocus())
 fireEvent.change(screen.getByLabelText('Quantidade: Água teste'),{target:{value:'1,5'}})
 fireEvent.keyDown(screen.getByLabelText('Quantidade: Água teste'),{key:'Enter'})
 expect(screen.getByLabelText('Custo: Água teste')).toHaveFocus()
 fireEvent.change(screen.getByLabelText('Custo: Água teste'),{target:{value:'20.00'}})
 fireEvent.keyDown(screen.getByLabelText('Custo: Água teste'),{key:'Enter'})
 expect(screen.getByLabelText('Buscar produto para adicionar')).toHaveFocus()
 expect(screen.queryByRole('button',{name:/Água teste.*caixa/})).not.toBeInTheDocument()
 expect(screen.getByText(/Entrada prevista: 18 un/)).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'+ Cadastrar fornecedor aqui'}))
 fireEvent.change(screen.getByLabelText('Nome do novo fornecedor'),{target:{value:'Novo fornecedor'}})
 fireEvent.click(screen.getByRole('button',{name:'Cadastrar e selecionar'}))
 await waitFor(()=>expect(screen.getByLabelText('Fornecedor')).toHaveValue('new'))
 expect(screen.getByLabelText('Quantidade: Água teste')).toHaveValue('1,5')
 fireEvent.click(screen.getByRole('button',{name:'Registrar compra'}))
 await screen.findByRole('heading',{name:'Compra registrada'})
 expect(screen.getByRole('link',{name:'Financeiro da compra →'})).toHaveAttribute('href','/financeiro/despesas?purchase=purchase')
 expect(writes).toHaveLength(2)
 expect(writes[1].body).toMatchObject({supplierId:'new',document:'Teste 01',items:[{productId:'water',quantity:1.5,purchaseCost:20,total:null}]})
 expect(writes.some(w=>w.path.endsWith('/receive'))).toBe(false)
 fireEvent.click(screen.getByRole('button',{name:'Receber esta compra'}))
 expect(onReceive).toHaveBeenCalledWith(expect.objectContaining({id:'purchase'}));client.clear()
})
it('preserva campos em falha, bloqueia duplicação enquanto salva e permite tentar novamente',async()=>{
 let release!:(r:Response)=>void
 const api=vi.spyOn(globalThis,'fetch').mockImplementationOnce(()=>new Promise(resolve=>{release=resolve})).mockResolvedValue(new Response(JSON.stringify({id:'ok',document:'Retry',total:2,items:[]})))
 const {client}=setup()
 fireEvent.change(screen.getByLabelText('Fornecedor'),{target:{value:'supplier'}})
 fireEvent.change(screen.getByLabelText('Documento ou referência única da compra'),{target:{value:'Retry'}})
 fireEvent.click(screen.getByRole('button',{name:/Água teste/}))
 fireEvent.change(screen.getByLabelText('Quantidade: Água teste'),{target:{value:'1'}})
 fireEvent.change(screen.getByLabelText('Custo: Água teste'),{target:{value:'2'}})
 fireEvent.click(screen.getByRole('button',{name:'Registrar compra'}))
 expect(screen.getByRole('button',{name:'Registrando…'})).toBeDisabled()
 fireEvent.click(screen.getByRole('button',{name:'Registrando…'}));expect(api).toHaveBeenCalledTimes(1)
 release(new Response(JSON.stringify({detail:'Falha de teste'}),{status:503}))
 await screen.findByRole('alert');expect(screen.getByLabelText('Quantidade: Água teste')).toHaveValue('1')
 fireEvent.click(screen.getByRole('button',{name:'Registrar compra'}))
 await screen.findByRole('heading',{name:'Compra registrada'});expect(api).toHaveBeenCalledTimes(2);client.clear()
})
it('valida decimais, arredondamento bancário e total divergente',()=>{
 expect(decimal('1,125')).toBe(1.125);expect(decimal('1.125')).toBe(1.125)
 for(const input of ['', '-1','1,','1.1234','1e3'])expect(decimal(input)).toBeNull()
 expect(rowTotal({productId:'x',quantity:'1,005',cost:'1',total:''}).total).toBe(1)
 expect(rowTotal({productId:'x',quantity:'2',cost:'10',total:'30'}).error).not.toBe('')
 expect(rowTotal({productId:'x',quantity:'2',cost:'10',total:'20,01'}).total).toBe(20.01)
})
