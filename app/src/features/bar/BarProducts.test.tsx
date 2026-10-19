import { fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { BarProductsPage } from './BarPages'

it('lista antes de editar, pagina e preserva os campos complementares no salvamento',async()=>{
  const entries=Array.from({length:23},(_,i)=>({product:{id:'p'+i,version:7,name:'Produto '+i,code:'C'+i,shortName:'P'+i,categoryId:'c',saleUnit:'un',salePrice:i===0?0:5,controlsStock:true,minimumStock:2,active:true,displayOrder:i,favorite:false,prepared:false,barcode:'123'},purchaseUnit:'cx',conversionFactor:12,averageCost:2,lastCost:2,mainSupplierId:'s'}))
  const response=(value:unknown)=>new Response(JSON.stringify(value))
  const api=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{const path=String(input);if(init?.method==='PUT')return response({...entries[0],...JSON.parse(String(init.body))});if(path.endsWith('/products'))return response(entries);if(path.endsWith('/categories'))return response([{id:'c',name:'Bebidas'}]);if(path.endsWith('/suppliers'))return response([{id:'s',name:'Fornecedor'}]);return response([])})
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/bar/produtos?q=Produto']}><BarProductsPage/></MemoryRouter></QueryClientProvider>)
  await screen.findByRole('table',{name:'Produtos do bar'})
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Código interno')).not.toBeInTheDocument()
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(21)
  expect(screen.getByText('R$ 0,00')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Próxima'}))
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(4)
  fireEvent.click(screen.getByRole('button',{name:'Anterior'}))
  fireEvent.click(within(screen.getByRole('row',{name:/Produto 0 /})).getByRole('button',{name:'Editar'}))
  await screen.findByRole('dialog',{name:'Editar produto'})
  await waitFor(()=>expect(screen.getByRole('option',{name:'Fornecedor',hidden:true})).toBeInTheDocument())
  fireEvent.change(screen.getByLabelText('Preço de venda (R$)'),{target:{value:'6'}})
  fireEvent.click(screen.getByRole('button',{name:'Salvar produto'}))
  await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  const write=api.mock.calls.find(([,init])=>init?.method==='PUT')
  expect(write?.[0]).toContain('/products/p0')
  expect(JSON.parse(String(write?.[1]?.body))).toMatchObject({version:7,categoryId:'c',salePrice:6,averageCost:2,purchaseUnit:'cx',conversionFactor:12,controlsStock:true,mainSupplierId:'s',barcode:'123',minimumStock:2})
  expect(screen.getByRole('searchbox')).toHaveValue('Produto')
  client.clear()
})


it.each([{categories:[]},{categories:[{id:'c',name:'Bebidas'},{id:'none',name:'Sem categoria'}]}])('cadastra com três campos principais e categoria automática (%j)',async({categories})=>{
 const response=(value:unknown)=>new Response(JSON.stringify(value));
 const api=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
  if(init?.method==='POST')return response({});
  return response(String(input).endsWith('/categories')?categories:[]);
 });
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/bar/produtos?acao=novo']}><BarProductsPage/></MemoryRouter></QueryClientProvider>);
 await screen.findByLabelText('Nome');
 fireEvent.change(screen.getByLabelText('Nome'),{target:{value:'Água mineral'}});
 const dialog=within(screen.getByRole('dialog'));
 expect(dialog.getByLabelText('Categoria (opcional)')).not.toBeVisible();
 expect(dialog.getByLabelText('Categoria (opcional)')).not.toBeRequired();
 expect(dialog.getByLabelText('Categoria (opcional)')).toHaveValue('');
 for(const label of ['Nome','Preço de venda (R$)','Unidade de venda'])expect(dialog.getByLabelText(label)).toBeVisible();
 expect(dialog.getAllByRole('option',{name:'Sem categoria',hidden:true})).toHaveLength(1);
 fireEvent.change(screen.getByLabelText('Preço de venda (R$)'),{target:{value:'5'}});
 expect(screen.queryByLabelText('Código interno')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Salvar produto'}));
 await waitFor(()=>expect(api.mock.calls.some(([,init])=>init?.method==='POST')).toBe(true));
 const write=api.mock.calls.find(([,init])=>init?.method==='POST');
 expect(JSON.parse(String(write?.[1]?.body))).toMatchObject({code:'',name:'Água mineral',shortName:'Água mineral',categoryId:null,saleUnit:'un',purchaseUnit:'un',conversionFactor:1,averageCost:0,minimumStock:0,controlsStock:true,active:true});
 client.clear();
});


it.each(['c',''])('permite escolher e limpar a categoria em Mais opções (%s)',async(categoryId)=>{
 const response=(value:unknown)=>new Response(JSON.stringify(value));
 const api=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
  if(init?.method==='POST')return response({});
  return response(String(input).endsWith('/categories')?[{id:'c',name:'Bebidas'}]:[]);
 });
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/bar/produtos?acao=novo']}><BarProductsPage/></MemoryRouter></QueryClientProvider>);
 await screen.findByLabelText('Nome');
 fireEvent.change(screen.getByLabelText('Nome'),{target:{value:'Suco teste'}});
 fireEvent.change(screen.getByLabelText('Preço de venda (R$)'),{target:{value:'8'}});
 fireEvent.click(screen.getByText('Mais opções'));
 const category=screen.getByLabelText('Categoria (opcional)');
 expect(category).toBeVisible();
 fireEvent.change(category,{target:{value:'c'}});
 if(!categoryId)fireEvent.change(category,{target:{value:''}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar produto'}));
 await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
 const write=api.mock.calls.find(([,init])=>init?.method==='POST');
 expect(JSON.parse(String(write?.[1]?.body))).toMatchObject({categoryId:categoryId||null});
 client.clear();
});
