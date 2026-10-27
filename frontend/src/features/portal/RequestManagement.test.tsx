import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import { RequestManagement } from './RequestManagement'
const clients: QueryClient[]=[]
const request={id:'request1',userId:'client1',customerName:'Cliente de teste',kind:'Trial',date:'2026-10-12',startTime:'10:00',endTime:'11:00',message:'Primeira aula',status:'Sent',version:1,reply:''}
const json=(body:unknown)=>new Response(JSON.stringify(body),{status:200})
function mount(){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);const auth={user:{id:'manager',name:'Gestão',email:'test@example.invalid',roles:['Manager'],permissions:['students:write','projects:write']}} as AuthContextValue;return render(<QueryClientProvider client={client}><AuthContext.Provider value={auth}><MemoryRouter><RequestManagement/></MemoryRouter></AuthContext.Provider></QueryClientProvider>)}
afterEach(()=>{cleanup();clients.splice(0).forEach(c=>c.clear());vi.restoreAllMocks()})
it('confirma aula com a quadra única e professor, preservando o horário pedido',async()=>{
 let sent:unknown;vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{if(init?.method==='POST'){sent=JSON.parse(String(init.body));return json({...request,status:'Confirmed',version:2})}return String(input).endsWith('/options')?json({courts:[{id:'court1',name:'Quadra 1'}],teachers:[{id:'teacher1',name:'Marina'}]}):json([request])});mount()
 fireEvent.click(await screen.findByText('Responder solicitação'));fireEvent.change(screen.getByLabelText('Resposta'),{target:{value:'Confirmed'}})
 await screen.findByRole('option',{name:'Marina'});expect(screen.queryByLabelText('Quadra')).not.toBeInTheDocument();expect(screen.getByLabelText('Início')).toBeDisabled();expect(screen.getByLabelText('Data')).toBeDisabled()
 fireEvent.change(screen.getByLabelText('Professor'),{target:{value:'teacher1'}});fireEvent.change(screen.getByLabelText('Valor combinado (R$)'),{target:{value:'0'}});fireEvent.change(screen.getByLabelText('Mensagem para o cliente'),{target:{value:'Aula confirmada'}});fireEvent.click(screen.getByRole('button',{name:'Enviar resposta'}))
 await waitFor(()=>expect(sent).toMatchObject({courtId:'court1',teacherId:'teacher1',action:'Confirmed',date:'2026-10-12',startTime:'10:00',endTime:'11:00',amount:0,version:1}))
})
it('pedido retirado fica nas concluídas sem formulário para confirmação',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(json([{...request,status:'Withdrawn'}]));mount();await screen.findByText('Nenhuma solicitação nesta seleção.');fireEvent.click(screen.getByRole('button',{name:'Concluídas'}));expect(await screen.findByText('Retirada pelo cliente')).toBeInTheDocument();expect(screen.queryByText('Responder solicitação')).not.toBeInTheDocument()
})
