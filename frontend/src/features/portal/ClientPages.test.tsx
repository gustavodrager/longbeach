import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
function mount(content:React.ReactNode,path='/minha-area',currentUser=user) { const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);const auth:AuthContextValue={user:currentUser,isBootstrapping:false,signIn:async()=>{},signInWithGoogle:async()=>{},signOut:async()=>{},changePassword:async()=>{},completeFirstAccessWithGoogle:async()=>{}};return render(<QueryClientProvider client={client}><AuthContext.Provider value={auth}><MemoryRouter initialEntries={[path]}>{content}</MemoryRouter></AuthContext.Provider></QueryClientProvider>) }
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})}
const profile={name:'Cliente teste',email:user.email,phone:'11988887777',reminders:true,links:[]}
const ownCustomer={id:'own-client',name:'Nome canônico',phone:'11977776666',email:null,status:'Ativo',version:4,origin:'Google',incomplete:false,userId:user.id,profiles:[],mergedIntoId:null}
const request:PortalRequest={id:'r1',userId:user.id,customerName:user.name,kind:'Reservation',date:'2026-10-10',startTime:'18:00',endTime:'19:00',courtId:'court1',message:'Pedido',status:'Alternative',reply:'Podemos neste horário',version:2,updatedAtUtc:'2026-10-06T12:00:00Z',amount:50}
// Keep the booking fixtures in the future regardless of the day the suite runs.
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-09T12:00:00Z'))})
afterEach(()=>{vi.useRealTimers();cleanup();clients.splice(0).forEach(c=>c.clear());sessionStorage.clear();vi.restoreAllMocks()})
it('área pessoal tem cinco destinos sem navegação da gestão',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>String(input).endsWith('/profile')?json(profile):json([]));mount(<Routes><Route path="/minha-area" element={<ClientLayout/>}><Route index element={<PortalHome/>}/></Route></Routes>)
 expect(await screen.findByRole('heading',{name:'Minha área'})).toBeInTheDocument();expect(screen.getByRole('navigation',{name:'Minha área'}).querySelectorAll('a')).toHaveLength(5);expect(screen.queryByText('Gestão da arena')).not.toBeInTheDocument();expect(screen.queryByRole('link',{name:'Área de trabalho'})).not.toBeInTheDocument();expect(screen.queryByText('Sua arena, no seu ritmo')).not.toBeInTheDocument();expect(await screen.findByRole('link',{name:'Aula experimental'})).toHaveAttribute('href','/minha-area/solicitar?tipo=Trial');expect(screen.getByRole('link',{name:'Início'})).toHaveAttribute('aria-current','page');expect(fetch.mock.calls.every(([url])=>String(url).includes('/api/v1/me/'))).toBe(true)
})
it.each([
 ['Manager','/'],['Teacher','/professor'],['Operations','/atendimento/vender'],
] as const)('área pessoal mantém retorno ao trabalho do perfil %s',async(role,destination)=>{
 mount(<Routes><Route path="/minha-area" element={<ClientLayout/>}><Route index element={<h1>Área pessoal</h1>}/></Route></Routes>,'/minha-area',{...user,roles:[role],permissions:['bar:sales:operate']})
 expect(screen.getByRole('link',{name:'Área de trabalho'})).toHaveAttribute('href',destination)
})
it('início conserva compromisso, resposta, comanda e valores do próprio cliente',async()=>{
 const appointment={key:'own-class',sourceId:'class-own',kind:'Aula',title:'Beach tênis',date:'2026-10-10',startTime:'18:00',endTime:'19:00',court:'Quadra 2',teacher:'Professora teste',status:'Confirmada',instructions:'',canChange:true,canRate:false}
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>{
  const url=String(input)
  if(url.endsWith('/profile'))return json({...profile,links:[{kind:'students',sourceId:'own-student',name:'Cliente teste'}]})
  if(url.endsWith('/agenda'))return json([appointment])
  if(url.endsWith('/requests'))return json([request,{...request,id:'reply',status:'Confirmed',reply:'Reserva confirmada pela equipe'}])
  return json([{id:'own-tab',kind:'Bar',state:'Open',payable:25,pending:10}])
 })
 mount(<PortalHome/>)
 expect(await screen.findByRole('heading',{name:'Beach tênis'})).toBeInTheDocument()
 expect(screen.getByText(/18:00–19:00/)).toBeInTheDocument();expect(screen.getByText(/Quadra 2 · Professor: Professora teste/)).toBeInTheDocument()
 expect(screen.getByRole('link',{name:'Ver compromisso'})).toHaveAttribute('href','/minha-area/agenda?atividade=own-class')
 expect(screen.getByText(/Reserva confirmada pela equipe/)).toBeInTheDocument();expect(screen.getByText('1')).toBeInTheDocument()
 expect(screen.getByText(/R\$\s*25,00/)).toBeInTheDocument();expect(screen.getByText(/R\$\s*10,00 em confirmação/)).toBeInTheDocument()
 expect(screen.getByRole('link',{name:'Ver comanda'})).toHaveAttribute('href','/minha-area/bar')
 expect(screen.queryByRole('heading',{name:'Cadastro sem vínculos'})).not.toBeInTheDocument()
 expect(fetch.mock.calls.every(([url,init])=>String(url).startsWith('/api/v1/me/')&&!init?.method)).toBe(true)
})
it('falha no início mantém alerta e tentativa sem indicar agenda ou saldo vazios',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(json({message:'Falha temporária'},503));mount(<PortalHome/>)
 expect(await screen.findAllByRole('alert')).toHaveLength(3)
 expect(screen.queryByText('Nenhum compromisso agendado')).not.toBeInTheDocument();expect(screen.queryByText('Nenhum valor disponível para pagar.')).not.toBeInTheDocument();expect(screen.queryByText('Nenhuma solicitação pendente.')).not.toBeInTheDocument()
 expect(screen.getAllByRole('button',{name:'Tentar novamente'})).toHaveLength(3)
})
it('falha de consulta não vira agenda vazia',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(json({message:'Falha temporária'},503));mount(<PortalAgenda/>);expect(await screen.findAllByRole('alert')).not.toHaveLength(0);expect(screen.queryByText('Nenhum compromisso nos próximos 60 dias')).not.toBeInTheDocument()
})
it('solicitação interrompida mantém dados e identificador após recarregar',async()=>{
 const attempts:Record<string,unknown>[]=[];vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{if(init?.method==='POST'){attempts.push(JSON.parse(String(init.body)));return attempts.length===1?json({message:'Conexão interrompida'},503):json({...request,status:'Sent'})}return String(input).endsWith('/options')?json({courts:[],teachers:[]}):json([])})
 const page=<Routes><Route path="/minha-area/solicitar" element={<PortalRequestForm/>}/><Route path="/minha-area/agenda" element={<h1>Solicitação enviada</h1>}/></Routes>
 const first=mount(page,'/minha-area/solicitar?tipo=Reservation');expect(screen.getByText('Enviar esta solicitação não garante a vaga nem altera seu compromisso atual.')).toBeVisible();fireEvent.change(screen.getByLabelText('Data desejada'),{target:{value:'2026-10-10'}});fireEvent.change(screen.getByLabelText('Das'),{target:{value:'23:00'}});fireEvent.change(screen.getByLabelText('Até'),{target:{value:'00:00'}});fireEvent.click(screen.getByRole('button',{name:'Enviar solicitação'}));expect(await screen.findByRole('alert')).toHaveTextContent('Conexão interrompida');first.unmount()
 mount(page,'/minha-area/solicitar?tipo=Reservation');expect(screen.getByLabelText('Data desejada')).toHaveValue('2026-10-10');expect(screen.getByLabelText('Data desejada')).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'Verificar envio'}));await screen.findByRole('heading',{name:'Solicitação enviada'});expect(attempts).toHaveLength(2);expect(attempts[0]).toEqual(attempts[1]);expect(attempts[0].endTime).toBe('24:00');expect(sessionStorage.length).toBe(0)
})
it('erro de validação permite corrigir a solicitação',async()=>{
 vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>init?.method==='POST'?json({message:'Horário inválido'},400):String(input).endsWith('/options')?json({courts:[],teachers:[]}):json([]));mount(<PortalRequestForm/>,'/minha-area/solicitar?tipo=Reservation');fireEvent.change(screen.getByLabelText('Data desejada'),{target:{value:'2026-10-10'}});fireEvent.change(screen.getByLabelText('Das'),{target:{value:'19:00'}});fireEvent.change(screen.getByLabelText('Até'),{target:{value:'18:00'}});fireEvent.click(screen.getByRole('button',{name:'Enviar solicitação'}));await screen.findByRole('alert');expect(screen.getByLabelText('Até')).not.toBeDisabled();expect(screen.getByRole('button',{name:'Enviar solicitação'})).not.toBeDisabled()
})
it('alternativa exige ação explícita e conserva erro de disponibilidade',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async(_input,init)=>init?.method==='POST'?json({message:'Horário ocupado'},400):json({courts:[{id:'court1',name:'Quadra 1'}],teachers:[]}));mount(<RequestCard request={request}/>);await waitFor(()=>expect(fetch).toHaveBeenCalled());expect(screen.queryByText('Quadra 1')).not.toBeInTheDocument();expect(fetch.mock.calls.filter(([,i])=>i?.method==='POST')).toHaveLength(0);fireEvent.click(screen.getByRole('button',{name:'Aceitar este horário'}));expect(await screen.findByRole('alert')).toHaveTextContent('Horário ocupado');expect(screen.getByText(/ainda não está reservado/)).toBeInTheDocument()
})
it('preferência de lembrete é salva sem mudar e-mail ou identidade',async()=>{
 const writes:{url:string;body:Record<string,unknown>}[]=[];vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{const url=String(input);if(init?.method==='PUT')writes.push({url,body:JSON.parse(String(init.body))});return json(url.endsWith('/customer')?ownCustomer:profile)});mount(<PortalProfile/>);await screen.findByDisplayValue(ownCustomer.name);fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Salvar perfil'}));await screen.findByText('Perfil atualizado.');expect(writes).toEqual([{url:'/api/v1/me/customer',body:{operationId:expect.any(String),name:ownCustomer.name,phone:ownCustomer.phone,expectedVersion:4}},{url:'/api/v1/me/portal/profile',body:{name:ownCustomer.name,phone:ownCustomer.phone,reminders:false}}]);expect(writes[0].body).not.toHaveProperty('userId');expect(writes[0].body).not.toHaveProperty('email')
})
it('cadastro próprio novo pede telefone e não associa aluno ou responsável por contato',async()=>{
 const writes:Record<string,unknown>[]=[];vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{if(init?.method==='PUT'){const body=JSON.parse(String(init.body));writes.push(body);return json(String(input).endsWith('/customer')?{...ownCustomer,name:body.name,phone:body.phone,version:1}:profile)}return json(String(input).endsWith('/customer')?null:profile)})
 mount(<PortalProfile/>);const phone=await screen.findByLabelText('Telefone com DDD');expect(phone).toBeRequired();fireEvent.change(phone,{target:{value:''}});fireEvent.click(screen.getByRole('button',{name:'Salvar perfil'}));expect(writes).toHaveLength(0)
 fireEvent.change(phone,{target:{value:'11999998888'}});fireEvent.click(screen.getByRole('button',{name:'Salvar perfil'}));await screen.findByText('Perfil atualizado.');expect(writes[0]).toEqual({operationId:expect.any(String),name:profile.name,phone:'11999998888'});expect(screen.getByText(/não substitui o cadastro de um aluno dependente/)).toBeInTheDocument()
})
it('perfil legado incompleto mantém telefone vazio e permite preferência',async()=>{
 const old={...ownCustomer,phone:'',incomplete:true};const writes:Record<string,unknown>[]=[];vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{if(init?.method==='PUT')writes.push(JSON.parse(String(init.body)));return json(String(input).endsWith('/customer')?old:profile)})
 mount(<PortalProfile/>);const phone=await screen.findByLabelText('Telefone com DDD');expect(phone).not.toBeRequired();expect(phone).toHaveValue('');fireEvent.click(screen.getByRole('button',{name:'Salvar perfil'}));await screen.findByText('Perfil atualizado.');expect(writes[0]).toMatchObject({phone:'',expectedVersion:4})
})
it('perfil incerto repete corpo e versão após remontar sem salvar preferências antes da confirmação',async()=>{
 const attempts:Record<string,unknown>[]=[];const reminders:unknown[]=[];vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{const url=String(input);if(init?.method==='PUT'&&url.endsWith('/customer')){attempts.push(JSON.parse(String(init.body)));return attempts.length===1?json({message:'Resposta interrompida'},503):json(ownCustomer)}if(init?.method==='PUT')reminders.push(JSON.parse(String(init.body)));return json(url.endsWith('/customer')?ownCustomer:profile)})
 const first=mount(<PortalProfile/>);await screen.findByDisplayValue(ownCustomer.name);fireEvent.click(screen.getByRole('button',{name:'Salvar perfil'}));await screen.findByRole('alert');expect(reminders).toHaveLength(0);first.unmount()
 mount(<PortalProfile/>);const retry=await screen.findByRole('button',{name:'Conferir perfil'});expect(screen.getByLabelText('Telefone com DDD')).toBeDisabled();fireEvent.click(retry);await screen.findByText('Perfil atualizado.');expect(attempts).toHaveLength(2);expect(attempts[1]).toEqual(attempts[0]);expect(reminders).toEqual([{name:ownCustomer.name,phone:ownCustomer.phone,reminders:true}]);expect(sessionStorage.length).toBe(0)
})
it('conflito do perfil consulta versão atual e conserva os dados digitados',async()=>{
 let version=4;const attempts:Record<string,unknown>[]=[];vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{const url=String(input);if(init?.method==='PUT'&&url.endsWith('/customer')){const body=JSON.parse(String(init.body));attempts.push(body);if(attempts.length===1){version=7;return json({message:'Cadastro mudou. Confira antes de salvar.'},409)}return json({...ownCustomer,name:body.name,version:8})}return json(url.endsWith('/customer')?{...ownCustomer,version}:profile)})
 mount(<PortalProfile/>);const name=await screen.findByLabelText('Como você quer ser chamado?');fireEvent.change(name,{target:{value:'Nome conferido'}});version=6;await clients.at(-1)!.invalidateQueries({queryKey:['own-customer']});fireEvent.click(screen.getByRole('button',{name:'Salvar perfil'}));await screen.findByRole('alert');expect(screen.getByRole('button',{name:'Salvar perfil'})).toBeDisabled();expect(name).toHaveValue('Nome conferido');expect(await screen.findByText(/Cadastro atual: Nome canônico/)).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Manter meus dados após conferir'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Salvar perfil'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Salvar perfil'}));await screen.findByText('Perfil atualizado.');expect(attempts.map(a=>a.expectedVersion)).toEqual([4,7]);expect(attempts[1].operationId).not.toBe(attempts[0].operationId)
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

it('preferência interrompida retoma somente etapa do portal sem criar cliente novamente',async()=>{
 let customerWrites=0;const preferenceWrites:Record<string,unknown>[]=[]
 vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{const url=String(input);if(init?.method==='PUT'&&url.endsWith('/customer')){customerWrites++;return json({...ownCustomer,phone:'5511999998888',version:5})}if(init?.method==='PUT'){preferenceWrites.push(JSON.parse(String(init.body)));return preferenceWrites.length===1?json({message:'Preferência não confirmada'},503):json(profile)}return json(url.endsWith('/customer')?ownCustomer:profile)})
 const first=mount(<PortalProfile/>);await screen.findByDisplayValue(ownCustomer.name);fireEvent.click(screen.getByRole('button',{name:'Salvar perfil'}));await screen.findByRole('alert');first.unmount();mount(<PortalProfile/>);fireEvent.click(await screen.findByRole('button',{name:'Conferir perfil'}));await screen.findByText('Perfil atualizado.');expect(customerWrites).toBe(1);expect(preferenceWrites).toHaveLength(2);expect(preferenceWrites[0]).toEqual(preferenceWrites[1]);expect(preferenceWrites[0]).toEqual({name:ownCustomer.name,phone:'5511999998888',reminders:true})
})
it('perfil mantém telefone canônico internacional válido ao salvar lembretes',async()=>{
 const international={...ownCustomer,phone:'5511999998888'};const writes:Record<string,unknown>[]=[]
 vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{if(init?.method==='PUT')writes.push(JSON.parse(String(init.body)));return json(String(input).endsWith('/customer')?international:profile)});mount(<PortalProfile/>);expect(await screen.findByLabelText('Telefone com DDD')).toHaveValue(international.phone);fireEvent.click(screen.getByRole('button',{name:'Salvar perfil'}));await screen.findByText('Perfil atualizado.');expect(writes[0]).toMatchObject({phone:international.phone})
})

it('conflito com consulta falha bloqueia gravação até carregar e aceitar contato atual',async()=>{
 let conflicted=false,failRead=true;const writes:Record<string,unknown>[]=[];const updated={...ownCustomer,name:'Contato atual da equipe',phone:'5511988887777',version:7}
 vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{const url=String(input);if(init?.method==='PUT'&&url.endsWith('/customer')){writes.push(JSON.parse(String(init.body)));if(!conflicted){conflicted=true;return json({message:'Perfil alterado por outra pessoa'},409)}return json(updated)}if(url.endsWith('/customer'))return conflicted?(failRead?json({message:'Consulta indisponível'},503):json(updated)):json(ownCustomer);return json(profile)})
 mount(<PortalProfile/>);const name=await screen.findByLabelText('Como você quer ser chamado?');fireEvent.change(name,{target:{value:'Meu rascunho preservado'}});fireEvent.click(screen.getByRole('button',{name:'Salvar perfil'}));await screen.findByText('Perfil alterado por outra pessoa');expect(name).toHaveValue('Meu rascunho preservado');expect(screen.getByRole('button',{name:'Salvar perfil'})).toBeDisabled();expect(screen.queryByRole('button',{name:'Manter meus dados após conferir'})).not.toBeInTheDocument();expect(writes).toHaveLength(1)
 failRead=false;fireEvent.click(screen.getByRole('button',{name:'Consultar cadastro atualizado'}));await screen.findByText(/Cadastro atual: Contato atual da equipe/);fireEvent.click(screen.getByRole('button',{name:'Usar cadastro atualizado'}));expect(name).toHaveValue(updated.name);expect(screen.getByLabelText('Telefone com DDD')).toHaveValue(updated.phone);fireEvent.click(screen.getByRole('button',{name:'Salvar perfil'}));await screen.findByText('Perfil atualizado.');expect(writes[1]).toMatchObject({name:updated.name,phone:updated.phone,expectedVersion:7})
})


it('agenda mantém quadra, professor, situação e opções do compromisso e avalia só a visita escolhida', async () => {
 const future={key:'own-future',sourceId:'class-own',kind:'Aula',title:'Aula da cliente',date:'2026-10-10',startTime:'18:00',endTime:'19:00',court:'Quadra 1',teacher:'Professora teste',status:'Confirmada',instructions:'Trazer água.',canChange:true,canRate:false}
 const past={...future,key:'own-past',sourceId:'reservation-own',kind:'Reserva',title:'Visita da cliente',date:'2026-10-08',canChange:false,canRate:true}
 const writes:unknown[]=[]
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{if(init?.method==='POST'){writes.push(JSON.parse(String(init.body)));return json({})}return json(String(input).endsWith('/agenda')?[future,past]:[])})
 mount(<PortalAgenda/>,'/minha-area/agenda?atividade=own-future')
 await screen.findByRole('heading',{name:future.title})
 expect(screen.getByText('Quadra 1 · Professor: Professora teste')).toBeVisible()
 expect(screen.getByText('Confirmada')).toBeVisible()
 expect(screen.getByRole('link',{name:'Solicitar remarcação'})).toHaveAttribute('href','/minha-area/solicitar?tipo=Reschedule&atividade=own-future')
 expect(writes).toHaveLength(0)
 fireEvent.click(screen.getByRole('button',{name:'Histórico'}))
 expect(screen.queryByRole('heading',{name:future.title})).not.toBeInTheDocument()
 expect(screen.getByRole('heading',{name:past.title})).toBeVisible()
 fireEvent.change(screen.getByRole('combobox',{name:'Como foi sua visita?'}),{target:{value:'5'}})
 fireEvent.click(screen.getByRole('button',{name:'Enviar avaliação'}))
 await screen.findByText('Obrigado por avaliar sua visita.')
 expect(writes).toEqual([{appointmentKey:'own-past',score:5}])
 expect(fetch.mock.calls.every(([url])=>String(url).startsWith('/api/v1/me/portal/'))).toBe(true)
})

it('falha ao atualizar solicitações não apresenta a seleção vazia anterior como confirmada', async () => {
 let failed=false
 vi.spyOn(globalThis,'fetch').mockImplementation(async input=>String(input).endsWith('/requests')&&failed?json({message:'Sem conexão'},503):json([]))
 mount(<PortalAgenda/>,'/minha-area/agenda')
 await screen.findByText('Nenhuma solicitação.')
 failed=true
 await act(async()=>{await clients.at(-1)!.invalidateQueries({queryKey:['portal',user.id,'requests']})})
 expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível atualizar.')
 expect(screen.queryByText('Nenhuma solicitação.')).not.toBeInTheDocument()
})

it('bar sem comanda mantém ajuda recolhida e contato disponível',async()=>{
 vi.spyOn(globalThis,'fetch').mockImplementation(async input=>String(input).endsWith('/options')?json({courts:[],teachers:[],helpUrl:'https://example.invalid/ajuda'}):json([]))
 mount(<PortalBar/>,'/minha-area/bar')
 expect(await screen.findByRole('heading',{name:'Nenhuma comanda aberta'})).toBeVisible()
 expect(screen.getByText('Peça à equipe o QR da sua comanda para pedir pelo celular.')).toBeVisible()
 const help=screen.getByText('Ajuda e contato',{selector:'summary'})
 expect(help.closest('details')).not.toHaveAttribute('open')
 fireEvent.click(help)
 expect(await screen.findByRole('link',{name:'Falar com a arena'})).toHaveAttribute('href','https://example.invalid/ajuda')
})
