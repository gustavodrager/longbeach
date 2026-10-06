import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import type { AuthUser } from '../auth/types'
import { ClientLayout } from './ClientLayout'
import { PortalHome, PortalAgenda, PortalRequestForm, PortalProfile, RequestCard } from './ClientPages'
import { CopyPix } from '../../components/CopyPix'
import type { PortalRequest } from './api'
const user:AuthUser={id:'portal-user',name:'Cliente teste',email:'client@example.invalid',roles:['Student'],permissions:[]}
const clients:QueryClient[]=[]
function mount(content:React.ReactNode,path='/minha-area') { const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);const auth:AuthContextValue={user,isBootstrapping:false,signIn:async()=>{},signInWithGoogle:async()=>{},signOut:async()=>{},changePassword:async()=>{},completeFirstAccessWithGoogle:async()=>{}};return render(<QueryClientProvider client={client}><AuthContext.Provider value={auth}><MemoryRouter initialEntries={[path]}>{content}</MemoryRouter></AuthContext.Provider></QueryClientProvider>) }
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})}
const profile={name:'Cliente teste',email:user.email,phone:'11988887777',reminders:true,links:[]}
const request:PortalRequest={id:'r1',userId:user.id,customerName:user.name,kind:'Reservation',date:'2026-10-10',startTime:'18:00',endTime:'19:00',courtId:'court1',message:'Pedido',status:'Alternative',reply:'Podemos neste horário',version:2,updatedAtUtc:'2026-10-06T12:00:00Z',amount:50}
afterEach(()=>{cleanup();clients.splice(0).forEach(c=>c.clear());sessionStorage.clear();vi.restoreAllMocks()})
it('área pessoal tem cinco destinos sem navegação da gestão',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>String(input).endsWith('/profile')?json(profile):json([]));mount(<Routes><Route path="/minha-area" element={<ClientLayout/>}><Route index element={<PortalHome/>}/></Route></Routes>)
 expect(await screen.findByRole('heading',{name:'Olá, Cliente'})).toBeInTheDocument();expect(screen.getByRole('navigation',{name:'Minha área'}).querySelectorAll('a')).toHaveLength(5);expect(screen.queryByText('Gestão da arena')).not.toBeInTheDocument();expect(await screen.findByRole('link',{name:'Experimentar uma aula'})).toHaveAttribute('href','/minha-area/solicitar?tipo=Trial');expect(fetch.mock.calls.every(([url])=>String(url).includes('/api/v1/me/'))).toBe(true)
})
it('falha de consulta não vira agenda vazia',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(json({message:'Falha temporária'},503));mount(<PortalAgenda/>);expect(await screen.findAllByRole('alert')).not.toHaveLength(0);expect(screen.queryByText('Nenhum compromisso nos próximos 60 dias')).not.toBeInTheDocument()
})
it('solicitação interrompida mantém dados e identificador após recarregar',async()=>{
 const attempts:Record<string,unknown>[]=[];vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{if(init?.method==='POST'){attempts.push(JSON.parse(String(init.body)));return attempts.length===1?json({message:'Conexão interrompida'},503):json({...request,status:'Sent'})}return String(input).endsWith('/options')?json({courts:[],teachers:[]}):json([])})
 const page=<Routes><Route path="/minha-area/solicitar" element={<PortalRequestForm/>}/><Route path="/minha-area/agenda" element={<h1>Solicitação enviada</h1>}/></Routes>
 const first=mount(page,'/minha-area/solicitar?tipo=Reservation');fireEvent.change(screen.getByLabelText('Data desejada'),{target:{value:'2026-10-10'}});fireEvent.change(screen.getByLabelText('Das'),{target:{value:'23:00'}});fireEvent.change(screen.getByLabelText('Até'),{target:{value:'00:00'}});fireEvent.click(screen.getByRole('button',{name:'Enviar solicitação'}));expect(await screen.findByRole('alert')).toHaveTextContent('Conexão interrompida');first.unmount()
 mount(page,'/minha-area/solicitar?tipo=Reservation');expect(screen.getByLabelText('Data desejada')).toHaveValue('2026-10-10');expect(screen.getByLabelText('Data desejada')).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'Verificar envio'}));await screen.findByRole('heading',{name:'Solicitação enviada'});expect(attempts).toHaveLength(2);expect(attempts[0]).toEqual(attempts[1]);expect(attempts[0].endTime).toBe('24:00');expect(sessionStorage.length).toBe(0)
})
it('erro de validação permite corrigir a solicitação',async()=>{
 vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>init?.method==='POST'?json({message:'Horário inválido'},400):String(input).endsWith('/options')?json({courts:[],teachers:[]}):json([]));mount(<PortalRequestForm/>,'/minha-area/solicitar?tipo=Reservation');fireEvent.change(screen.getByLabelText('Data desejada'),{target:{value:'2026-10-10'}});fireEvent.change(screen.getByLabelText('Das'),{target:{value:'19:00'}});fireEvent.change(screen.getByLabelText('Até'),{target:{value:'18:00'}});fireEvent.click(screen.getByRole('button',{name:'Enviar solicitação'}));await screen.findByRole('alert');expect(screen.getByLabelText('Até')).not.toBeDisabled();expect(screen.getByRole('button',{name:'Enviar solicitação'})).not.toBeDisabled()
})
it('alternativa exige ação explícita e conserva erro de disponibilidade',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async(_input,init)=>init?.method==='POST'?json({message:'Horário ocupado'},400):json({courts:[{id:'court1',name:'Quadra 1'}],teachers:[]}));mount(<RequestCard request={request}/>);expect(await screen.findByText('Quadra 1')).toBeInTheDocument();expect(fetch.mock.calls.filter(([,i])=>i?.method==='POST')).toHaveLength(0);fireEvent.click(screen.getByRole('button',{name:'Aceitar este horário'}));expect(await screen.findByRole('alert')).toHaveTextContent('Horário ocupado');expect(screen.getByText(/ainda não está reservado/)).toBeInTheDocument()
})
it('preferência de lembrete é salva sem mudar e-mail ou identidade',async()=>{
 const writes:Record<string,unknown>[]=[];vi.spyOn(globalThis,'fetch').mockImplementation(async(_input,init)=>{if(init?.method==='PUT')writes.push(JSON.parse(String(init.body)));return json(profile)});mount(<PortalProfile/>);await screen.findByDisplayValue('Cliente teste');fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Salvar perfil'}));await screen.findByText('Perfil atualizado.');expect(writes).toEqual([{name:profile.name,phone:profile.phone,reminders:false}])
})
it('cópia de Pix confirma sucesso e oferece alternativa quando clipboard falha',async()=>{
 const copy=vi.fn().mockResolvedValue(undefined);Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:copy}});mount(<CopyPix code="pix-test-code"/>);fireEvent.click(screen.getByRole('button',{name:'Copiar código Pix'}));await screen.findByText('Código copiado. Abra seu banco para pagar.');expect(copy).toHaveBeenCalledWith('pix-test-code');copy.mockRejectedValue(new Error('denied'));fireEvent.click(screen.getByRole('button',{name:'Copiar código Pix'}));await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Selecione o código'))
})
