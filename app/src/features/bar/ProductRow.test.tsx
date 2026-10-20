import { render,screen,fireEvent,waitFor } from '@testing-library/react'
import { QueryClient,QueryClientProvider } from '@tanstack/react-query'
import { ProductRow } from './ProductRow'
const item={product:{id:'p',name:'Água',shortName:'Água',code:'LB',categoryId:'c',saleUnit:'un',salePrice:5,controlsStock:true,minimumStock:0,favorite:false,displayOrder:0,active:false,version:4},purchaseUnit:'cx',conversionFactor:12,averageCost:2,lastCost:2}
it('preserva valores na falha e repete a mesma operação conjunta sem duplicar',async()=>{
 let fail=true;const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>fail?new Response(JSON.stringify({detail:'Tente novamente'}),{status:503}):new Response('{}'));
 const close=vi.fn();const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<QueryClientProvider client={client}><table><tbody><ProductRow item={item} balance={{productId:'p',locationId:'bar',quantity:10,reserved:3,available:7,version:8,name:'Água',low:false,minimumStock:0,unit:'un',alertEligible:true,active:true,controlsStock:true}} stockReady canAdjust categories={[]} suppliers={[]} editing onEdit={()=>{}} onClose={close}/></tbody></table></QueryClientProvider>);
 expect(screen.queryByLabelText('Situação do produto')).not.toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Quantidade disponível'),{target:{value:'2,125'}});
 fireEvent.change(screen.getByLabelText('Preço de venda (R$)'),{target:{value:'6'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar'}));await screen.findByRole('alert');
 expect(close).not.toHaveBeenCalled();expect(screen.getByLabelText('Quantidade disponível')).toHaveValue('2,125');
 fail=false;fireEvent.click(screen.getByRole('button',{name:'Salvar'}));await waitFor(()=>expect(close).toHaveBeenCalledOnce());
 const bodies=fetch.mock.calls.map(([,init])=>JSON.parse(String(init?.body)));
 expect(bodies[0]).toMatchObject({available:2.125,stockVersion:8,product:{active:false,version:4,salePrice:6,purchaseUnit:'cx',conversionFactor:12}});
 expect(bodies[1].operationId).toBe(bodies[0].operationId);client.clear();
});
