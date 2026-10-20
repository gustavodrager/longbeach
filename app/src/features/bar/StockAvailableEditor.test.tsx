import { afterEach, expect, it, vi } from 'vitest'
import { render,screen,fireEvent,waitFor } from '@testing-library/react'
import { QueryClient,QueryClientProvider } from '@tanstack/react-query'
import { StockAvailableEditor } from './StockAvailableEditor'
const balance={productId:'p',locationId:'bar',name:'Água',quantity:10,reserved:3,available:7,version:4,unit:'un',minimumStock:0,low:false,active:true,controlsStock:true,alertEligible:true}
afterEach(()=>vi.restoreAllMocks())
it('envia o novo disponível e versão, aceitando zero explícito',async()=>{
const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(null,{status:204}));const close=vi.fn();
render(<QueryClientProvider client={new QueryClient()}><StockAvailableEditor balance={balance} onClose={close}/></QueryClientProvider>);
fireEvent.change(screen.getByLabelText('Nova quantidade disponível'),{target:{value:''}});expect(screen.getByText('Salvar quantidade')).toBeDisabled();
fireEvent.change(screen.getByLabelText('Nova quantidade disponível'),{target:{value:'0'}});fireEvent.click(screen.getByText('Salvar quantidade'));
await waitFor(()=>expect(close).toHaveBeenCalled());expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({available:0,expectedVersion:4});
})
it('preserva valor e operação para repetir após falha',async()=>{
const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response(JSON.stringify({title:'Falha temporária'}),{status:500})).mockResolvedValueOnce(new Response(null,{status:204}));
render(<QueryClientProvider client={new QueryClient()}><StockAvailableEditor balance={balance} onClose={()=>{}}/></QueryClientProvider>);
fireEvent.change(screen.getByLabelText('Nova quantidade disponível'),{target:{value:'2,125'}});fireEvent.click(screen.getByText('Salvar quantidade'));await screen.findByRole('alert');expect(screen.getByLabelText('Nova quantidade disponível')).toHaveValue('2,125');fireEvent.click(screen.getByText('Salvar quantidade'));
await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));const bodies=fetch.mock.calls.map(x=>JSON.parse(String(x[1]?.body)));expect(bodies[0].operationId).toBe(bodies[1].operationId);expect(bodies[1].available).toBe(2.125);
})
