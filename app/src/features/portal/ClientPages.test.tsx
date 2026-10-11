import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import type { AuthUser } from '../auth/types'
import { ClientLayout } from './ClientLayout'
import { PortalHome, PortalAgenda, PortalRequestForm, PortalProfile, PortalBar, RequestCard } from './ClientPages'
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
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async(_input,init)=>init?.method==='POST'?json({message:'Horário ocupado'},400):json({courts:[{id:'court1',name:'Quadra 1'}],teachers:[]}));mount(<RequestCard request={request}/>);await waitFor(()=>expect(fetch).toHaveBeenCalled());expect(screen.queryByText('Quadra 1')).not.toBeInTheDocument();expect(fetch.mock.calls.filter(([,i])=>i?.method==='POST')).toHaveLength(0);fireEvent.click(screen.getByRole('button',{name:'Aceitar este horário'}));expect(await screen.findByRole('alert')).toHaveTextContent('Horário ocupado');expect(screen.getByText(/ainda não está reservado/)).toBeInTheDocument()
})
it('preferência de lembrete é salva sem mudar e-mail ou identidade',async()=>{
 const writes:Record<string,unknown>[]=[];vi.spyOn(globalThis,'fetch').mockImplementation(async(_input,init)=>{if(init?.method==='PUT')writes.push(JSON.parse(String(init.body)));return json(profile)});mount(<PortalProfile/>);await screen.findByDisplayValue('Cliente teste');fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Salvar perfil'}));await screen.findByText('Perfil atualizado.');expect(writes).toEqual([{name:profile.name,phone:profile.phone,reminders:false}])
})
it('cópia de Pix confirma sucesso e oferece alternativa quando clipboard falha',async()=>{
 const copy=vi.fn().mockResolvedValue(undefined);Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:copy}});mount(<CopyPix code="pix-test-code"/>);fireEvent.click(screen.getByRole('button',{name:'Copiar código Pix'}));await screen.findByText('Código copiado. Abra seu banco para pagar.');expect(copy).toHaveBeenCalledWith('pix-test-code');copy.mockRejectedValue(new Error('denied'));fireEvent.click(screen.getByRole('button',{name:'Copiar código Pix'}));await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Selecione o código'))
})

it('horário livre preenche até uma hora e usa a única quadra sem seletor',async()=>{
 let sent:Record<string,unknown>|undefined
 vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{const url=String(input);if(init?.method==='POST'){sent=JSON.parse(String(init.body));return json(request)}if(url.includes('/availability'))return json({date:'2026-10-12',courtId:'court1',status:'Available',freeIntervals:[{startTime:'23:30',endTime:'24:00'}],updatedAtUtc:'2026-10-10T12:00:00Z'});return url.endsWith('/options')?json({courts:[{id:'court1',name:'Quadra 1'}],teachers:[]}):json([])})
 mount(<PortalRequestForm/>,'/minha-area/solicitar?tipo=Reservation');fireEvent.change(screen.getByLabelText('Data desejada'),{target:{value:'2026-10-12'}})
 fireEvent.click(await screen.findByRole('button',{name:/23:30–24:00/}));expect(screen.getByLabelText('Das')).toHaveValue('23:30');expect(screen.getByLabelText('Até')).toHaveValue('00:00');expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Enviar solicitação'}));await waitFor(()=>expect(sent).toMatchObject({courtId:'court1',startTime:'23:30',endTime:'24:00'}))
})
it('falha na disponibilidade não inventa horários livres',async()=>{
 vi.spyOn(globalThis,'fetch').mockImplementation(async input=>String(input).includes('/availability')?json({message:'Falha'},503):String(input).endsWith('/options')?json({courts:[],teachers:[]}):json([]));mount(<PortalRequestForm/>);fireEvent.change(screen.getByLabelText('Data desejada'),{target:{value:'2026-10-12'}});expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível consultar a disponibilidade');expect(screen.queryByRole('button',{name:/Usar início/})).not.toBeInTheDocument()
})
it('cliente pode recusar proposta pendente com controle de versão',async()=>{
 const calls:unknown[]=[];vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{if(init?.method==='POST')calls.push([String(input),JSON.parse(String(init.body))]);return json({courts:[],teachers:[]})});mount(<RequestCard request={request}/>);fireEvent.click(screen.getByRole('button',{name:'Recusar proposta e encerrar pedido'}));await waitFor(()=>expect(calls).toEqual([['/api/v1/me/portal/requests/r1/withdraw',{version:2}]]))
})

it('bar permite consultar itens e abrir a conta correta sem emitir acesso automaticamente',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>json([{id:'bar-own',kind:'Bar',state:'Open',title:'Comanda da visita',total:22,paid:5,pending:10,payable:7,payments:[],items:[{id:'water',name:'Água',quantity:2,unitPrice:5,total:10,state:'Fulfilled'}]}]));mount(<PortalBar/>,'/minha-area/bar')
 expect(await screen.findByRole('link',{name:'Ver conta e pagar'})).toHaveAttribute('href','/minha-area/pagamentos?conta=bar-own');fireEvent.click(screen.getByText('Itens da comanda'));expect(screen.getByText('2 × Água')).toBeInTheDocument();expect(screen.getByText('Em confirmação')).toBeInTheDocument();expect(fetch.mock.calls.every(([,init])=>!init?.method)).toBe(true)
})
