import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { countQuantity, useQuickCount } from './useQuickCount'
import type { StockCount } from './StockCounts'
const count:StockCount={id:'count',locationId:'bar',initial:false,state:'Counting',items:[{productId:'a',theoretical:4,counted:null},{productId:'b',theoretical:2,counted:null}]}
function setup(){
 const writes:{body:{productId:string;quantity:number};resolve:(r:Response)=>void}[]=[]
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation((_url,init)=>new Promise(resolve=>writes.push({body:JSON.parse(String(init?.body)),resolve})))
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});client.setQueryData(['bar','/counts'],[count])
 const hook=renderHook(()=>useQuickCount(count),{wrapper:({children}:{children:ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>})
 const finish=async(index:number,fail=false)=>{await act(async()=>{const write=writes[index];write.resolve(new Response(JSON.stringify(fail?{message:'Falha simulada'}:{...count,items:count.items.map(i=>i.productId===write.body.productId?{...i,counted:write.body.quantity}:i)}),{status:fail?500:200,headers:{'Content-Type':'application/json'}}))})}
 return {...hook,client,writes,finish,fetch}
}
afterEach(()=>vi.restoreAllMocks())
it('aceita vírgula/ponto e zero, interpreta vazio como zero e rejeita incompleto, negativo e precisão excessiva',()=>{
 for(const value of ['-1','1,','1.','1e2','1.2345','1,2,3'])expect(countQuantity(value)).toBeNull()
 expect(countQuantity('')).toBe(0);expect(countQuantity(' ')).toBe(0);expect(countQuantity('0')).toBe(0);expect(countQuantity('2,125')).toBe(2.125);expect(countQuantity('2.125')).toBe(2.125)
})
it('serializa itens, preserva edição recente e atualiza apenas o item confirmado do cache',async()=>{
 const {result,writes,finish,client}=setup()
 act(()=>{result.current.change('a','3');result.current.save('a');result.current.change('b','1');result.current.save('b')})
 expect(writes).toHaveLength(1);expect(result.current.busy).toBe(true)
 act(()=>{result.current.change('a','7');result.current.save('a')})
 await finish(0)
 expect(result.current.entries.a.value).toBe('7');expect(result.current.dirty).toBe(true);expect(writes).toHaveLength(2)
 await finish(1);expect(writes).toHaveLength(3)
 await finish(2)
 expect(result.current.dirty).toBe(false);expect(result.current.busy).toBe(false)
 expect(client.getQueryData<StockCount[]>(['bar','/counts'])?.[0].items.map(i=>i.counted)).toEqual([7,1])
})
it('deduplica Enter e blur da mesma revisão e não grava durante digitação',async()=>{
 const {result,writes,finish}=setup()
 act(()=>result.current.change('a','1'));expect(writes).toHaveLength(0)
 act(()=>{result.current.save('a');result.current.save('a');result.current.shortcut('a',1)});expect(writes).toHaveLength(1)
 await finish(0);act(()=>result.current.save('a'));expect(writes).toHaveLength(1)
})
it('mantém erro e rascunho na falha e permite tentar novamente',async()=>{
 const {result,writes,finish}=setup()
 act(()=>{result.current.shortcut('a',0)});await finish(0,true)
 expect(result.current.entries.a.status).toBe('error');expect(result.current.entries.a.value).toBe('0');expect(result.current.dirty).toBe(true)
 act(()=>result.current.save('a'));await finish(1)
 expect(writes).toHaveLength(2);expect(result.current.entries.a.status).toBe('saved');expect(result.current.dirty).toBe(false)
})
it('não sobrescreve digitação nem envia valor antigo ainda na fila',async()=>{
 const {result,writes,finish}=setup()
 act(()=>{result.current.shortcut('a',3);result.current.shortcut('b',1);result.current.change('b','2,')})
 await finish(0)
 expect(writes).toHaveLength(1);expect(result.current.entries.b.value).toBe('2,');expect(result.current.dirty).toBe(true)
 act(()=>{expect(result.current.save('b')).toBe(false)});expect(writes).toHaveLength(1)
})
it('abandona a fila ao desmontar, sem disparar novas gravações',async()=>{
 const {result,writes,finish,unmount}=setup()
 act(()=>{result.current.shortcut('a',3);result.current.shortcut('b',1)})
 unmount();await finish(0);expect(writes).toHaveLength(1)
})
it('impede uma consulta antiga de substituir a quantidade confirmada',async()=>{
 const {result,finish,client}=setup()
 let resolveOld!:(value:StockCount[])=>void
 const oldRequest=client.fetchQuery({queryKey:['bar','/counts'],queryFn:()=>new Promise<StockCount[]>(resolve=>{resolveOld=resolve})}).catch(()=>undefined)
 act(()=>result.current.shortcut('a',3))
 await finish(0)
 await act(async()=>{resolveOld([count]);await oldRequest})
 expect(client.getQueryData<StockCount[]>(['bar','/counts'])?.[0].items[0].counted).toBe(3)
 expect(result.current.entries.a.status).toBe('saved')
})

it('apagar quantidade já salva grava zero, mantendo branco sem erro',async()=>{
 const {result,writes,finish}=setup()
 act(()=>result.current.shortcut('a',4));await finish(0)
 act(()=>{result.current.change('a','');result.current.save('a')});await finish(1)
 expect(writes[1].body.quantity).toBe(0);expect(result.current.entries.a.value).toBe('');expect(result.current.dirty).toBe(false)
})
it('campo nunca preenchido fica disponível para zerar apenas na aprovação',()=>{
 const {result,writes}=setup()
 act(()=>result.current.save('a'))
 expect(writes).toHaveLength(0);expect(result.current.dirty).toBe(false)
})
