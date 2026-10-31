import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import type { AuthUser } from '../auth/types'
import { TeacherLayout,TeacherHome,TeacherClasses,TeacherRoster,TeacherAccess } from './TeachingPages'
import { hasPermission,workHome } from '../auth/access'
const teacher:AuthUser={id:'teacher',name:'Professor',email:'teacher@example.invalid',roles:['Teacher'],permissions:['students:read','students:write','projects:read']}
const cls={id:'c1',name:'Iniciantes',weekDay:6,startTime:'08:00',endTime:'09:00',startDate:'2026-10-01',status:'Ativa',capacity:6,enrolled:1}
const clients:QueryClient[]=[]
function mount(path='/professor',user=teacher){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);const auth={user,isBootstrapping:false,signOut:async()=>{}} as AuthContextValue;return render(<QueryClientProvider client={client}><AuthContext.Provider value={auth}><MemoryRouter initialEntries={[path]}><Routes><Route path="professor" element={<TeacherLayout/>}><Route index element={<TeacherHome/>}/><Route path="turmas" element={<TeacherClasses/>}/><Route path="presencas" element={<TeacherClasses attendance/>}/><Route path="turmas/:classId" element={<TeacherRoster/>}/></Route></Routes></MemoryRouter></AuthContext.Provider></QueryClientProvider>)}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})
afterEach(()=>{cleanup();clients.splice(0).forEach(c=>c.clear());vi.restoreAllMocks()})
it('professor recebe navegação própria e alternância pessoal sem módulos da gestão',async()=>{vi.spyOn(globalThis,'fetch').mockResolvedValue(json({linked:true,classes:[cls]}));mount();await screen.findByRole('heading',{name:'Aulas de hoje'});expect(screen.getByRole('navigation',{name:'Área do professor'}).querySelectorAll('a')).toHaveLength(3);fireEvent.click(screen.getByRole('button',{name:'Conta'}));expect(screen.getByRole('link',{name:'Minha área'})).toHaveAttribute('href','/minha-area');expect(screen.queryByRole('link',{name:'Gestão'})).not.toBeInTheDocument()})
it('vínculo ausente não vira lista vazia de alunos',async()=>{vi.spyOn(globalThis,'fetch').mockResolvedValue(json({linked:false,classes:[]}));mount();expect(await screen.findByRole('heading',{name:'Turmas ainda não vinculadas'})).toBeInTheDocument();expect(screen.queryByText('Nenhuma aula na grade hoje')).not.toBeInTheDocument()})
it('cliente não consulta a API de professores por URL direta',async()=>{const fetch=vi.spyOn(globalThis,'fetch');mount('/professor',{...teacher,roles:['Student']});expect(await screen.findByRole('heading',{name:'Acesso restrito'})).toBeInTheDocument();expect(fetch).not.toHaveBeenCalled()})
it('registra presença no endpoint delimitado, com versão, e mostra confirmação',async()=>{let status:string|null=null;let version=0;const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{if(init?.method==='PUT'){const body=JSON.parse(String(init.body));status=body.status;version++;}return String(input).includes('/classes/')?json({class:cls,date:'2026-10-03',students:[{id:'s1',name:'Ana',presence:status,version}]}):json({linked:true,classes:[cls]})});mount('/professor/turmas/c1?date=2026-10-03');fireEvent.click(await screen.findByRole('button',{name:'Ana: Presente'}));await screen.findByText('Presença de Ana registrada.');expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/classes/c1/presences?date=2026-10-03'),expect.objectContaining({method:'PUT',body:JSON.stringify({studentId:'s1',status:'Presente',version:0})}));expect(screen.getByRole('button',{name:'Ana: Presente'})).toHaveAttribute('aria-pressed','true')})
it('erro de consulta não permite registrar nem indica ausência de alunos',async()=>{vi.spyOn(globalThis,'fetch').mockImplementation(async(input)=>String(input).includes('/classes/')?json({message:'Acesso restrito'},403):json({linked:true,classes:[cls]}));mount('/professor/turmas/c1?date=2026-10-03');await screen.findByRole('alert');expect(screen.queryByText('Nenhuma matrícula válida para esta data.')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:/Presente/})).not.toBeInTheDocument()})
it('perfis acumulados são bloqueados e gestor mantém acesso completo',()=>{expect(workHome(teacher)).toBe('/professor');expect(hasPermission(teacher,'students:read')).toBe(false);const bar={...teacher,roles:['Teacher','Operations','Student'] as AuthUser['roles'],permissions:[...teacher.permissions,'bar:sales:operate','bar:supervise','bar:stock:read']};expect(hasPermission(bar,'bar:sales:operate')).toBe(false);expect(hasPermission(bar,'bar:supervise')).toBe(false);expect(hasPermission(bar,'bar:stock:read')).toBe(false);expect(workHome({...teacher,roles:['Manager'],permissions:[]})).toBe('/');expect(hasPermission({...teacher,roles:['Manager'],permissions:[]},'users:manage')).toBe(true)})

it('aula experimental confirmada aparece no dia do professor mesmo sem turma regular',async()=>{
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
 vi.spyOn(globalThis,'fetch').mockResolvedValue(json({linked:true,classes:[],appointments:[{id:'trial1',name:'Aula experimental · Visitante',customerName:'Visitante',date,startTime:'14:00',endTime:'15:00',status:'Confirmada'}]}));mount();expect(await screen.findByRole('heading',{name:'Atividades agendadas'})).toBeInTheDocument();expect(screen.getByRole('heading',{name:'Aula experimental · Visitante'})).toBeInTheDocument();expect(screen.getByText(/14:00–15:00/)).toBeInTheDocument()
})

it('mostra horário, lotação, situação e chamada sem repetir a apresentação',async()=>{
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
 const weekDay=new Date(date+'T12:00:00').getDay()
 vi.spyOn(globalThis,'fetch').mockResolvedValue(json({linked:true,classes:[{...cls,weekDay}]}));mount();
 const card=await screen.findByRole('link',{name:/Iniciantes/})
 expect(card).toHaveAttribute('href',`/professor/turmas/c1?date=${date}`)
 expect(card).toHaveTextContent('08:00–09:00')
 expect(card).toHaveTextContent('Ativa')
 expect(card).toHaveTextContent('1/6 matrículas ativas')
 expect(card).toHaveTextContent('Alunos e presença')
 expect(screen.getByRole('link',{name:'Ver turmas'})).toHaveAttribute('href','/professor/turmas')
 expect(screen.getByRole('link',{name:'Hoje'})).toHaveAttribute('aria-current','page')
 expect(screen.queryByText('Área do professor')).not.toBeInTheDocument()
 expect(screen.queryByText('ÁREA DE TRABALHO')).not.toBeInTheDocument()
})
it('conta recolhida mantém saída e área pessoal acessíveis por botão',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(json({linked:true,classes:[]}));mount();
 const account=screen.getByRole('button',{name:'Conta'})
 expect(account).toHaveAttribute('aria-expanded','false')
 expect(screen.queryByRole('link',{name:'Minha área'})).not.toBeInTheDocument()
 fireEvent.click(account)
 expect(account).toHaveAttribute('aria-expanded','true')
 expect(screen.getByRole('dialog',{name:'Conta'})).toBeInTheDocument()
 expect(screen.getByRole('button',{name:'Sair'})).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Fechar Conta'}))
 expect(account).toHaveAttribute('aria-expanded','false')
})

it('avisa a concessão de acesso e salva apenas o vínculo escolhido pela gestão', async () => {
 const access={users:[{id:'prof-account',name:'Professora teste'}],team:[{id:'team-prof',name:'Cadastro teste'}],links:[]}
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async(_input,init)=>json(init?.method==='PUT'?{}:access))
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client)
 const auth={user:{...teacher,roles:['Manager']},isBootstrapping:false} as AuthContextValue
 render(<QueryClientProvider client={client}><AuthContext.Provider value={auth}><MemoryRouter><TeacherAccess/></MemoryRouter></AuthContext.Provider></QueryClientProvider>)
 expect(screen.getByText('Confira a identidade antes de salvar. O vínculo libera as turmas e a chamada desse professor.')).toBeVisible()
 const select=await screen.findByLabelText('Cadastro na equipe')
 expect(screen.getByRole('option',{name:'Sem vínculo · acesso às turmas bloqueado'})).toBeInTheDocument()
 fireEvent.change(select,{target:{value:'team-prof'}})
 fireEvent.submit(select.closest('form')!)
 expect(await screen.findByRole('status')).toHaveTextContent('Vínculo atualizado. O acesso às turmas passa a seguir este cadastro.')
 expect(fetch).toHaveBeenCalledWith('/api/v1/teaching/access',expect.objectContaining({method:'PUT',body:JSON.stringify({userId:'prof-account',teamId:'team-prof'})}))
})

it.each([['/professor/turmas','Minhas turmas'],['/professor/presencas','Presenças']])('lista %s mantém horário, situação e acesso à chamada',async(path,title)=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(json({linked:true,classes:[cls]}))
 mount(path)
 expect(await screen.findByRole('heading',{name:title,level:1})).toBeVisible()
 const card=await screen.findByRole('link',{name:/Iniciantes/})
 expect(card).toHaveTextContent('Sábado · 08:00–09:00')
 expect(card).toHaveTextContent('Ativa')
 expect(card).toHaveTextContent('1/6 matrículas ativas')
 expect(card).toHaveAttribute('href','/professor/turmas/c1')
 expect(screen.queryByText('ÁREA DO PROFESSOR')).not.toBeInTheDocument()
 expect(screen.queryByText(/A disponibilidade geral da arena/)).not.toBeInTheDocument()
})
