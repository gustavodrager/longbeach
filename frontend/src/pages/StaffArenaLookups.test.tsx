import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../features/auth/authContext'
import type { AuthUser } from '../features/auth/types'
import { DemoDataProvider, useOperations } from '../features/operations/DemoDataProvider'
import { ClassDetailsPage, ReservationDetailsPage } from './ArenaPages'
import { SchoolAgendaPage } from './SchoolAgendaPage'
import { RentalAgendaPage } from './RentalAgendaPage'

const court={id:'court-lookup',name:'Quadra de exemplo',sport:'Futevôlei',status:'Disponível',openingTime:'07:00',closingTime:'23:00',scheduleConfirmed:true}
const teacher={id:'teacher-lookup',name:'Professor de exemplo',role:'Professor de futevôlei',status:'Ativo'}
const clients:QueryClient[]=[]
const json=(body:unknown)=>new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}})
function Rights(){const data=useOperations();return <output data-testid="rights">{String(data.canRead('team'))}:{String(data.canRead('courts'))}:{String(data.canRead('reservations'))}</output>}
function start(path:string,menu:string){
 const user:AuthUser={id:'staff-lookup',name:'Equipe',email:'',roles:['Operations'],permissions:['students:read','students:write','projects:read','projects:write','employees:read'],staffAccess:{typeId:'atendente',name:'Atendente',role:'Operations',menus:[menu],actions:[menu+'.operate'],homePath:path.split('?')[0]}}
 const auth={user,isBootstrapping:false} as AuthContextValue
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});clients.push(client)
 render(<QueryClientProvider client={client}><AuthContext.Provider value={auth}><DemoDataProvider enabled><MemoryRouter initialEntries={[path]}><Rights/><Routes><Route path="/escola/turmas/:classId" element={<ClassDetailsPage/>}/><Route path="/agenda/:reservationId" element={<ReservationDetailsPage/>}/><Route path="/escola/agenda" element={<SchoolAgendaPage/>}/><Route path="/mensalistas/agenda" element={<RentalAgendaPage/>}/></Routes></MemoryRouter></DemoDataProvider></AuthContext.Provider></QueryClientProvider>)
}
function server(){return vi.spyOn(globalThis,'fetch').mockImplementation(async input=>{
 const url=new URL(String(input),'https://test.invalid')
 if(url.pathname.endsWith('/courts/schedule'))return json({date:url.searchParams.get('date'),updatedAtUtc:'2026-11-04T12:00:00Z',courts:[]})
 if(url.pathname.endsWith('/courts'))return json([court,{...court,id:'court-two',name:'Segunda quadra'}])
 if(url.pathname.endsWith('/team'))return json([teacher])
 if(url.pathname.endsWith('/customers/lookup'))return json({items:[],page:1,pageSize:20,total:0})
 return json([])
})}
beforeEach(()=>{vi.stubEnv('VITE_DEMO_MODE','false');vi.stubEnv('VITE_OPERATIONAL_STORAGE','postgres');localStorage.clear();sessionStorage.clear()})
afterEach(()=>{cleanup();clients.splice(0).forEach(client=>client.clear());vi.unstubAllEnvs();vi.restoreAllMocks()})
it('Turmas pode escolher professor e quadra sem abrir o cadastro da equipe ou do funcionamento',async()=>{
 const fetch=server();start('/escola/turmas/novo','classes')
 await screen.findByRole('option',{name:teacher.name})
 expect(screen.queryByRole('combobox',{name:'Quadra'})).not.toBeInTheDocument()
 expect(screen.getByRole('combobox',{name:'Professor'})).toBeEnabled()
 expect(within(screen.getByRole('combobox',{name:'Professor'})).getByRole('option',{name:teacher.name})).toBeInTheDocument()
 expect(screen.getByTestId('rights')).toHaveTextContent('false:false:false')
 expect(fetch.mock.calls.some(([url])=>String(url).endsWith('/team'))).toBe(true)
})
it('Agenda permite selecionar o professor da aula avulsa sem liberar edição da equipe',async()=>{
 server();start('/agenda/novo','agenda')
 await waitFor(()=>expect(screen.getByRole('combobox',{name:'Quadra'}).querySelectorAll('option')).toHaveLength(3))
 fireEvent.change(screen.getByRole('combobox',{name:'Tipo'}),{target:{value:'SingleLesson'}})
 expect(screen.getByRole('combobox',{name:'Professor'})).toBeEnabled()
 expect(screen.getByRole('option',{name:teacher.name})).toBeInTheDocument()
 expect(screen.getByTestId('rights')).toHaveTextContent('false:false:true')
})
it.each([['classes','/escola/agenda','Aulas'],['recurring','/mensalistas/agenda','Mensalistas']])('agenda de %s consulta ocupação sem abrir Agenda ou Funcionamento',async(menu,path,title)=>{
 const fetch=server();start(path+'?date=2026-11-04&view=day',menu)
 expect(await screen.findByRole('heading',{name:title})).toBeInTheDocument()
 await waitFor(()=>expect(fetch.mock.calls.some(([url])=>String(url).includes('/courts/schedule?'))).toBe(true))
 expect(screen.getByTestId('rights')).toHaveTextContent('false:false:false')
 expect(screen.queryByText('Acesso restrito')).not.toBeInTheDocument()
 expect(screen.queryByRole('link',{name:'Funcionamento'})).not.toBeInTheDocument()
})
