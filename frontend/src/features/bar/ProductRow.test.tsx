import { render,screen,fireEvent,waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient,QueryClientProvider } from '@tanstack/react-query'
import { ProductRow } from './ProductRow'
const item={product:{id:'p',name:'Água',shortName:'Água',code:'LB',categoryId:'c',saleUnit:'un',salePrice:5,controlsStock:true,minimumStock:0,favorite:false,displayOrder:0,active:false,version:4},purchaseUnit:'cx',conversionFactor:12,averageCost:2,lastCost:2}

function editWithStock(available:number,averageCost=2) {
 const api=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('{}'));
 const close=vi.fn();const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<QueryClientProvider client={client}><table><tbody><ProductRow item={{...item,averageCost,product:{...item.product,active:true}}} balance={{productId:'p',locationId:'bar',quantity:available,reserved:0,available,version:8,name:'Água',low:true,minimumStock:0,unit:'un',alertEligible:true,active:true,controlsStock:true}} stockReady canAdjust categories={[]} suppliers={[]} editing onEdit={()=>{}} onClose={close}/></tbody></table></QueryClientProvider>);
 const quantity=screen.getByLabelText('Quantidade disponível') as HTMLInputElement;
 return {api,close,client,quantity,form:quantity.form!};
}

it('salva nome, preço e custo sem ajustar o saldo negativo existente',async()=>{
 const {api,close,client,quantity,form}=editWithStock(-3,-2);
 fireEvent.change(screen.getByLabelText('Nome'),{target:{value:'Água alterada'}});
 fireEvent.change(screen.getByLabelText('Preço de venda (R$)'),{target:{value:'6,50'}});
 fireEvent.change(screen.getByLabelText('Custo unitário (R$)'),{target:{value:'3,456789'}});
 expect(quantity).toHaveValue('-3');expect(quantity.checkValidity()).toBe(true);expect(form.checkValidity()).toBe(true);
 // A formatação pode mudar sem representar um novo saldo.
 fireEvent.change(quantity,{target:{value:'-3,000'}});
 expect(form.checkValidity()).toBe(true);
 await userEvent.click(screen.getByRole('button',{name:'Salvar'}));
 await waitFor(()=>expect(close).toHaveBeenCalledOnce());
 expect(api).toHaveBeenCalledOnce();expect(api.mock.calls[0][0]).toContain('/products/p/stock');
 expect(JSON.parse(String(api.mock.calls[0][1]?.body))).toMatchObject({available:null,stockVersion:8,product:{name:'Água alterada',salePrice:6.5,averageCost:3.456789,version:4}});
 client.clear();
});

it.each([[-3,'-4'],[-3,'-2,5'],[7,'-3']] as const)('recusa alterar o disponível de %s para %s',async(initial,changed)=>{
 const {api,close,client,quantity,form}=editWithStock(initial);
 fireEvent.change(quantity,{target:{value:changed}});
 expect(quantity.validity.patternMismatch).toBe(true);expect(form.checkValidity()).toBe(false);
 await userEvent.click(screen.getByRole('button',{name:'Salvar'}));
 expect(api).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
 client.clear();
});

it.each([['0',0],['2,125',2.125]] as const)('mantém o ajuste versionado do saldo negativo para %s',async(typed,available)=>{
 const {api,close,client,quantity,form}=editWithStock(-3);
 fireEvent.change(quantity,{target:{value:typed}});
 expect(form.checkValidity()).toBe(true);
 await userEvent.click(screen.getByRole('button',{name:'Salvar'}));
 await waitFor(()=>expect(close).toHaveBeenCalledOnce());
 expect(api).toHaveBeenCalledOnce();
 expect(JSON.parse(String(api.mock.calls[0][1]?.body))).toMatchObject({available,stockVersion:8,product:{version:4}});
 client.clear();
});

it('preserva valores na falha e repete a mesma operação conjunta sem duplicar',async()=>{
 let fail=true;const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>fail?new Response(JSON.stringify({detail:'Tente novamente'}),{status:503}):new Response('{}'));
 const close=vi.fn();const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<QueryClientProvider client={client}><table><tbody><ProductRow item={item} balance={{productId:'p',locationId:'bar',quantity:10,reserved:3,available:7,version:8,name:'Água',low:false,minimumStock:0,unit:'un',alertEligible:true,active:true,controlsStock:true}} stockReady canAdjust categories={[]} suppliers={[]} editing onEdit={()=>{}} onClose={close}/></tbody></table></QueryClientProvider>);
 expect(screen.queryByLabelText('Situação do produto')).not.toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Quantidade disponível'),{target:{value:'2,125'}});
 fireEvent.change(screen.getByLabelText('Preço de venda (R$)'),{target:{value:'6'}});
 fireEvent.change(screen.getByLabelText('Custo unitário (R$)'),{target:{value:'2,123456'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar'}));await screen.findByRole('alert');
 expect(close).not.toHaveBeenCalled();expect(screen.getByLabelText('Quantidade disponível')).toHaveValue('2,125');
 fail=false;fireEvent.click(screen.getByRole('button',{name:'Salvar'}));await waitFor(()=>expect(close).toHaveBeenCalledOnce());
 const bodies=fetch.mock.calls.map(([,init])=>JSON.parse(String(init?.body)));
 expect(bodies[0]).toMatchObject({available:2.125,stockVersion:8,product:{active:false,version:4,salePrice:6,averageCost:2.123456,purchaseUnit:'cx',conversionFactor:12}});
 expect(bodies[1].operationId).toBe(bodies[0].operationId);client.clear();
});


it('altera a venda sem ajustar saldo e atualiza os catálogos em cache',async()=>{
 const api=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('{}'));
 const close=vi.fn();const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 const keys=[['bar','/products'],['bar-runtime','operator','/tabs/catalog'],['client-catalog','own-token']];
 keys.forEach(key=>client.setQueryData(key,[]));
 render(<QueryClientProvider client={client}><table><tbody><ProductRow item={{...item,product:{...item.product,active:true,availableForSale:true}}} stockReady canAdjust={false} categories={[]} suppliers={[]} editing onEdit={()=>{}} onClose={close}/></tbody></table></QueryClientProvider>);
 const available=screen.getByRole('checkbox',{name:'Disponível para venda'});expect(available).toBeChecked();
 fireEvent.click(available);fireEvent.click(screen.getByRole('button',{name:'Salvar'}));
 await waitFor(()=>expect(close).toHaveBeenCalledOnce());
 expect(api.mock.calls).toHaveLength(1);expect(api.mock.calls[0][0]).toContain('/products/p');
 expect(JSON.parse(String(api.mock.calls[0][1]?.body))).toMatchObject({availableForSale:false,version:4,active:true,averageCost:2});
 expect(JSON.parse(String(api.mock.calls[0][1]?.body))).not.toHaveProperty('stockVersion');
 keys.forEach(key=>expect(client.getQueryState(key)?.isInvalidated).toBe(true));client.clear();
});

it('confirma a exclusão versionada e preserva o rascunho quando o servidor bloqueia',async()=>{
 let blocked=true;const api=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>blocked?new Response(JSON.stringify({detail:'Este produto possui saldo ou uso em andamento.'}),{status:409}):new Response(null,{status:204}));
 const close=vi.fn();const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<QueryClientProvider client={client}><table><tbody><ProductRow item={item} stockReady canAdjust={false} categories={[]} suppliers={[]} editing onEdit={()=>{}} onClose={close}/></tbody></table></QueryClientProvider>);
 fireEvent.change(screen.getByLabelText('Nome'),{target:{value:'Água alterada'}});
 const remove=screen.getByRole('button',{name:'Excluir produto'});expect(remove).toHaveAttribute('type','button');fireEvent.click(remove);
 expect(api).not.toHaveBeenCalled();expect(screen.getByText(/Histórico preservado/)).toBeVisible();
 expect(screen.getByRole('button',{name:'Confirmar exclusão'})).toHaveFocus();
 fireEvent.click(screen.getByRole('button',{name:'Manter produto'}));
 expect(screen.getByRole('button',{name:'Excluir produto'})).toHaveFocus();expect(screen.getByLabelText('Nome')).toHaveValue('Água alterada');
 fireEvent.click(screen.getByRole('button',{name:'Excluir produto'}));fireEvent.click(screen.getByRole('button',{name:'Confirmar exclusão'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('saldo ou uso em andamento');expect(close).not.toHaveBeenCalled();
 expect(screen.getByLabelText('Nome')).toHaveValue('Água alterada');
 expect(api.mock.calls[0][0]).toContain('/products/p?version=4');expect(api.mock.calls[0][1]).toMatchObject({method:'DELETE',body:undefined});
 blocked=false;fireEvent.click(screen.getByRole('button',{name:'Confirmar exclusão'}));await waitFor(()=>expect(close).toHaveBeenCalledOnce());
 expect(api.mock.calls).toHaveLength(2);expect(api.mock.calls.every(([,init])=>init?.method==='DELETE')).toBe(true);client.clear();
});

it('não oferece alteração ou exclusão sem acesso de escrita, mesmo com edição solicitada',()=>{
 const client=new QueryClient();
 render(<QueryClientProvider client={client}><table><tbody><ProductRow item={{...item,product:{...item.product,availableForSale:false}}} stockReady canAdjust canEdit={false} categories={[]} suppliers={[]} editing onEdit={()=>{}} onClose={()=>{}}/></tbody></table></QueryClientProvider>);
 expect(screen.getByText('Fora da venda')).toBeInTheDocument();expect(screen.queryByRole('button')).not.toBeInTheDocument();expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();client.clear();
});
