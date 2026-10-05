import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../features/auth/authContext'
import { DemoDataProvider } from '../features/operations/DemoDataProvider'
import type { AuthUser } from '../features/auth/types'
import { AgendaPage, FinanceDetailsPage, FinancePage, MaintenanceDetailsPage, ReservationDetailsPage } from './ArenaPages'
import { DashboardPage } from './DashboardPage'
import { ProjectDetailsPage, TeamDetailsPage } from './OperationsPages'
import { today } from './arenaUi'

const owner: AuthUser={id:'11111111-1111-1111-1111-111111111111',name:'Admin teste',email:'teste@example.com',roles:['Owner'],permissions:[]}
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})}
function RouteState(){const location=useLocation();return <output data-testid="route">{location.pathname}{location.search}</output>}
function start(path:string,demoMode=true,user:AuthUser=owner){
  const auth:AuthContextValue={user,isBootstrapping:false,signIn:async()=>{},signInWithGoogle:async()=>{},signOut:async()=>{},changePassword:async()=>{}}
  const query=new QueryClient({defaultOptions:{queries:{retry:false}}})
  return render(<QueryClientProvider client={query}><AuthContext.Provider value={auth}><DemoDataProvider enabled demoMode={demoMode}><MemoryRouter initialEntries={[path]}><RouteState /><Routes><Route path="/" element={<DashboardPage />} /><Route path="/agenda" element={<AgendaPage />} /><Route path="/agenda/:reservationId" element={<ReservationDetailsPage />} /><Route path="/financeiro" element={<FinancePage />} /><Route path="/financeiro/:entryId" element={<FinanceDetailsPage />} /><Route path="/equipe/:memberId" element={<TeamDetailsPage />} /><Route path="/projetos/:projectId" element={<ProjectDetailsPage />} /><Route path="/manutencao/:maintenanceId" element={<MaintenanceDetailsPage />} /></Routes></MemoryRouter></DemoDataProvider></AuthContext.Provider></QueryClientProvider>)
}
const court={id:'22222222-2222-2222-2222-222222222222',name:'Quadra 1',sport:'Futevôlei',status:'Disponível',openingTime:'07:00',closingTime:'23:00'}
beforeEach(()=>{localStorage.clear();sessionStorage.clear();vi.stubEnv('VITE_DEMO_MODE','true');vi.stubEnv('VITE_OPERATIONAL_STORAGE','local')})
afterEach(()=>vi.unstubAllEnvs())

it('registra reserva uma vez em dois envios e preserva filtros ao abrir a ficha',async()=>{
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({courts:[court]}))
  start(`/agenda/novo?date=${today()}&court=${court.id}`)
  fireEvent.change(screen.getByLabelText('Nome da reserva'),{target:{value:'Treino do grupo'}})
  fireEvent.change(screen.getByLabelText('Quadra'),{target:{value:court.id}})
  fireEvent.change(screen.getByLabelText('Nome do cliente ou grupo'),{target:{value:'Grupo A'}})
  const form=screen.getByRole('button',{name:'Salvar reserva'}).closest('form')!
  act(()=>{fireEvent.submit(form);fireEvent.submit(form)})
  expect(await screen.findByRole('heading',{name:'Treino do grupo'})).toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem('longbeach-os-demo-v1')??'{}').reservations).toHaveLength(1)
  expect(screen.getByTestId('route')).toHaveTextContent(`date=${today()}`)
  expect(screen.getByRole('link',{name:'← Agenda e recepção'})).toHaveAttribute('href',expect.stringContaining(`court=${court.id}`))
})

it('mostra recebimentos pela data paga, abre a composição e preserva período ao voltar',async()=>{
  const day=today();const paid={id:'33333333-3333-3333-3333-333333333333',name:'Mensalidade de teste',direction:'Receber',origin:'Escola',amount:120,dueDate:'2000-01-01',status:'Pago',paidDate:day,notes:''}
  const pending={...paid,id:'44444444-4444-4444-4444-444444444444',name:'Valor ainda pendente',amount:80,status:'Pendente',paidDate:'',dueDate:day}
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({financeEntries:[paid,pending]}))
  start(`/?from=${day}&to=${day}`)
  const user=userEvent.setup();const card=screen.getByRole('link',{name:/Recebimentos registrados/})
  expect(within(card).getByText(/120,00/)).toBeInTheDocument()
  await user.click(card)
  expect(await screen.findByRole('heading',{name:'Financeiro operacional'})).toBeInTheDocument()
  expect(screen.queryByText('Valor ainda pendente')).not.toBeInTheDocument()
  await user.click(screen.getByRole('link',{name:/Mensalidade de teste/}))
  expect(await screen.findByRole('heading',{name:'Mensalidade de teste'})).toBeInTheDocument()
  expect(screen.getByTestId('route')).toHaveTextContent('dateField=paidDate')
  await user.click(screen.getByRole('link',{name:'← Financeiro'}))
  expect(screen.getByTestId('route')).toHaveTextContent(`from=${day}`)
  expect(screen.getByTestId('route')).toHaveTextContent('status=Pago')
})

it('falha ao salvar mantém a reserva e reenvia o mesmo identificador sem duplicar',async()=>{
  vi.stubEnv('VITE_DEMO_MODE','false');let attempts=0
  const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
    if(init?.method==='PUT'){attempts++;if(attempts===1)return json({message:'Falha temporária ao salvar.'},503);return json(JSON.parse(String(init.body)),201)}
    return json(String(input).endsWith('/courts')?[court]:[])
  })
  start('/agenda/novo',false)
  const user=userEvent.setup();await waitFor(()=>expect(screen.queryByText('Carregando registros da arena…')).not.toBeInTheDocument())
  await user.type(screen.getByLabelText('Nome da reserva'),'Reserva com conexão instável')
  await user.selectOptions(screen.getByLabelText('Quadra'),court.id)
  await user.click(screen.getByRole('button',{name:'Salvar reserva'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Falha temporária')
  expect(screen.getByLabelText('Nome da reserva')).toHaveValue('Reserva com conexão instável')
  await user.click(screen.getByRole('button',{name:'Salvar reserva'}))
  expect(await screen.findByRole('heading',{name:'Reserva com conexão instável'})).toBeInTheDocument()
  const writes=fetchMock.mock.calls.filter(([,init])=>init?.method==='PUT')
  expect(writes).toHaveLength(2)
  expect(writes[0][0]).toBe(writes[1][0])
})

it('produção lê a API e não envia cadastros locais do navegador',async()=>{
  vi.stubEnv('VITE_DEMO_MODE','false')
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({students:[{id:'legado-local',name:'Não importar automaticamente'}]}))
  const fetchMock=vi.spyOn(globalThis,'fetch').mockResolvedValue(json([]))
  start('/',false)
  await waitFor(()=>expect(fetchMock).toHaveBeenCalledWith('/api/v1/operations/students',expect.any(Object)))
  await waitFor(()=>expect(screen.queryByText('Carregando registros da arena…')).not.toBeInTheDocument())
  expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='PUT')).toHaveLength(0)
  expect(screen.queryByText('Não importar automaticamente')).not.toBeInTheDocument()
})

it('não apresenta custo redigido como zero para uma pessoa sem acesso financeiro',async()=>{
  vi.stubEnv('VITE_DEMO_MODE','false')
  const employee={id:'55555555-5555-5555-5555-555555555555',name:'Pessoa da equipe',phone:'',role:'Professor de futevôlei',payAmount:0,payBasis:'Por hora',paymentFrequency:'Semanal',paymentDay:'',status:'Ativo',notes:'Observação do acordo financeiro restrito',costsVisible:false}
  vi.spyOn(globalThis,'fetch').mockResolvedValue(json([employee]))
  start(`/equipe/${employee.id}`,false,{...owner,roles:['Operations'],permissions:['employees:read']})
  expect(await screen.findByRole('heading',{name:'Pessoa da equipe'})).toBeInTheDocument()
  expect(screen.getByText('Acesso restrito')).toBeInTheDocument()
  expect(screen.queryByText(/R\$\s*0,00/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Editar dados'})).not.toBeInTheDocument()
  expect(screen.queryByText('Observação do acordo financeiro restrito')).not.toBeInTheDocument()
})

it('cobrança criada pela reserva conserva a origem e volta ao lançamento específico',async()=>{
  const reservation={id:'66666666-6666-6666-6666-666666666666',name:'Treino de sábado',courtId:court.id,date:today(),startTime:'10:00',endTime:'11:00',customerName:'Grupo A',phone:'',amount:150,status:'Confirmada',notes:''}
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({courts:[court],reservations:[reservation]}))
  start(`/financeiro/novo?origin=Locações&source=${reservation.id}&range=all`)
  expect(screen.getByLabelText('Descrição do lançamento')).toHaveValue('Locação · Treino de sábado')
  expect(screen.getByLabelText('Valor (R$)')).toHaveValue(150)
  fireEvent.click(screen.getByRole('button',{name:'Salvar lançamento'}))
  expect(await screen.findByRole('heading',{name:'Locação · Treino de sábado'})).toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem('longbeach-os-demo-v1')??'{}').financeEntries[0]).toMatchObject({sourceId:reservation.id,sourceKind:'reservations',origin:'Locações',status:'Pendente',amount:150})
  expect(screen.getByRole('link',{name:'Ver registro de origem →'})).toHaveAttribute('href',`/agenda/${reservation.id}`)
  expect(screen.getByRole('link',{name:'← Financeiro'})).toHaveAttribute('href',expect.stringContaining(`source=${reservation.id}`))
})

it('recepção considera aulas na disponibilidade sem divulgar turma, professor ou alunos',async()=>{
  vi.stubEnv('VITE_DEMO_MODE','false')
  const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation(async(input)=>{
    const path=String(input)
    if(path.includes('/courts/schedule?'))return json({date:today(),updatedAtUtc:new Date().toISOString(),courts:[{courtId:court.id,openingTime:'07:00',closingTime:'23:00',availableMinutes:780,reservedMinutes:60,classMinutes:120,closedForMaintenance:false,hasConflict:false,blocks:[{source:'Aula',startTime:'18:00',endTime:'20:00',sourceId:null}]}]})
    return json(path.endsWith('/courts')?[court]:[])
  })
  start(`/agenda?date=${today()}`,false,{...owner,roles:['Operations'],permissions:['projects:read']})
  expect(await screen.findByText('1 h reservadas ou bloqueadas · 2 h de aulas · 13 h disponíveis')).toBeInTheDocument()
  expect(screen.getByText('Aula',{selector:'strong'})).toBeInTheDocument()
  expect(screen.queryByRole('link',{name:/18:00.*Aula/})).not.toBeInTheDocument()
  expect(fetchMock.mock.calls.some(([input])=>String(input).endsWith('/students')||String(input).endsWith('/classes')||String(input).endsWith('/team'))).toBe(false)
})

it('reservas de hoje abre exatamente a composição do indicador, sem bloqueios, canceladas ou aulas',async()=>{
  const day=today();const reservation={id:'77777777-7777-7777-7777-777777777777',name:'Reserva confirmada',courtId:court.id,date:day,startTime:'10:00',endTime:'11:00',customerName:'Grupo teste',phone:'',amount:100,status:'Confirmada',notes:''}
  const block={...reservation,id:'88888888-8888-8888-8888-888888888888',name:'Bloqueio para limpeza',status:'Bloqueio',startTime:'11:00',endTime:'12:00'}
  const canceled={...reservation,id:'99999999-9999-9999-9999-999999999999',name:'Reserva cancelada',status:'Cancelada'}
  const lesson={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',name:'Turma do dia',sport:'Futevôlei',courtId:court.id,weekDay:new Date(`${day}T12:00:00`).getDay(),startTime:'18:00',endTime:'19:00',teacherId:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',capacity:8,studentIds:[],status:'Ativa',notes:''}
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({courts:[court],reservations:[reservation,block,canceled],classes:[lesson]}))
  start('/')
  const card=screen.getByRole('link',{name:/Reservas de hoje/})
  expect(within(card).getByText('1')).toBeInTheDocument()
  await userEvent.setup().click(card)
  expect(await screen.findByRole('heading',{name:'Agenda e recepção'})).toBeInTheDocument()
  expect(screen.getByLabelText('Mostrar')).toHaveValue('reservations')
  expect(screen.getByRole('link',{name:/Reserva confirmada/})).toBeInTheDocument()
  expect(screen.queryByText('Bloqueio para limpeza')).not.toBeInTheDocument()
  expect(screen.queryByText('Reserva cancelada')).not.toBeInTheDocument()
  expect(screen.queryByText('Turma do dia')).not.toBeInTheDocument()
})

it('despesa criada pela manutenção conserva vínculo, tipo e retorno ao serviço original',async()=>{
  const maintenance={id:'cccccccc-cccc-cccc-cccc-cccccccccccc',name:'Trocar rede da quadra',area:'Quadra 1',owner:'Equipe teste',dueDate:today(),status:'Aberta',priority:'Normal',notes:''}
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({maintenance:[maintenance]}))
  start(`/manutencao/${maintenance.id}`)
  const user=userEvent.setup();await user.click(screen.getByRole('link',{name:'Ver despesas vinculadas →'}))
  await user.click(screen.getByRole('link',{name:'+ Novo lançamento'}))
  expect(screen.getByLabelText('Descrição do lançamento')).toHaveValue('Manutenção · Trocar rede da quadra')
  expect(screen.getByLabelText('Tipo')).toHaveValue('Pagar')
  expect(screen.getByLabelText('Origem')).toHaveValue('Arena')
  fireEvent.change(screen.getByLabelText('Valor (R$)'),{target:{value:'90'}})
  await user.click(screen.getByRole('button',{name:'Salvar lançamento'}))
  expect(await screen.findByRole('heading',{name:'Manutenção · Trocar rede da quadra'})).toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem('longbeach-os-demo-v1')??'{}').financeEntries[0]).toMatchObject({sourceId:maintenance.id,sourceKind:'maintenance',origin:'Arena',direction:'Pagar',amount:90})
  expect(screen.getByRole('link',{name:'Ver registro de origem →'})).toHaveAttribute('href',`/manutencao/${maintenance.id}`)
  await user.click(screen.getByRole('link',{name:'← Financeiro'}))
  expect(screen.getByRole('link',{name:/Manutenção · Trocar rede da quadra/})).toBeInTheDocument()
  expect(screen.getByTestId('route')).toHaveTextContent('sourceKind=maintenance')
})

it('remover ou renomear uma tarefa não transfere identidade nem conclusão para outra tarefa',async()=>{
  const project={id:'dddddddd-dddd-dddd-dddd-dddddddddddd',name:'Cuidar da arena',description:'',status:'Em andamento',startDate:'',dueDate:'',owner:'Equipe teste',estimatedCost:0,actualCost:0,notes:'',tasks:[{id:'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',title:'Comprar rede',done:true},{id:'ffffffff-ffff-ffff-ffff-ffffffffffff',title:'Instalar rede',done:false}]}
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({projects:[project]}))
  start(`/projetos/${project.id}`)
  const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'Editar projeto'}))
  await user.click(screen.getByRole('button',{name:'Remover tarefa 1'}))
  expect(screen.getByLabelText('Tarefa 1')).toHaveValue('Instalar rede')
  expect(screen.getByRole('checkbox',{name:'Concluir tarefa 1'})).not.toBeChecked()
  fireEvent.change(screen.getByLabelText('Tarefa 1'),{target:{value:'Instalar e conferir rede'}})
  await user.click(screen.getByRole('button',{name:'+ Adicionar tarefa'}))
  fireEvent.change(screen.getByLabelText('Tarefa 2'),{target:{value:'Liberar quadra'}})
  await user.click(screen.getByRole('button',{name:'Salvar projeto'}))
  await waitFor(()=>expect(JSON.parse(localStorage.getItem('longbeach-os-demo-v1')??'{}').projects[0].tasks).toHaveLength(2))
  const tasks=JSON.parse(localStorage.getItem('longbeach-os-demo-v1')??'{}').projects[0].tasks
  expect(tasks[0]).toEqual({id:project.tasks[1].id,title:'Instalar e conferir rede',done:false})
  expect(tasks[1]).toMatchObject({title:'Liberar quadra',done:false})
  expect(tasks[1].id).not.toBe(project.tasks[0].id)
  expect(tasks[1].id).not.toBe(project.tasks[1].id)
})
