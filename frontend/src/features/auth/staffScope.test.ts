import { describe, expect, it } from 'vitest'
import { hasPermission, workHome, barHome } from './access'
import { canManageStaff, hasStaffAction, staffKindAllowed, staffKindCanLoad, staffPathAllowed, staffScopeKey } from './staffScope'
import { loginDestination } from './loginDestination'
import type { AuthUser } from './types'

const bar=():AuthUser=>({id:'bar-user',name:'Pessoa do Bar',email:'',roles:['Operations'],permissions:['bar:sales:read','bar:sales:operate','bar:catalog:read','bar:cash:operate'],staffAccess:{typeId:'bar',name:'Bar',role:'Operations',menus:['bar.sell','bar.tabs','bar.orders','bar.receive','bar.cash'],actions:['bar.sell','bar.tabs','bar.orders','bar.receive','bar.cash'],homePath:'/atendimento/vender'}})
describe('isolamento de acesso da equipe',()=>{
  it.each(['/clientes','/alunos','/escola','/agenda','/equipe','/financeiro','/minha-area','/unknown'])('fecha a página %s para Bar',path=>expect(staffPathAllowed(bar(),path)).toBe(false))
  it('não permite que o perfil Gestor ultrapasse o tipo atribuído',()=>{
    const user=bar();user.roles=['Manager'];user.staffAccess!.role='Manager'
    expect(hasPermission(user,'finance:read')).toBe(false)
    expect(hasPermission(user,'bar:sales:operate')).toBe(true)
    expect(staffPathAllowed(user,'/financeiro')).toBe(false)
  })
  it('distingue dono de outro Gestor, inclusive fora dos tipos de equipe',()=>{
    const user:AuthUser={id:'gestor',name:'Gestor',email:'',roles:['Manager'],permissions:[]}
    expect(canManageStaff(user)).toBe(false)
    expect(hasPermission(user,'employees:write')).toBe(false)
    expect(staffPathAllowed(user,'/administracao/professores')).toBe(false)
    expect(canManageStaff({...user,canManageStaff:true})).toBe(true)
    expect(hasPermission({...user,canManageStaff:true},'employees:write')).toBe(true)
    expect(canManageStaff({...user,roles:['Operations'],canManageStaff:true})).toBe(false)
  })
  it('escolhe o início disponível sem depender do menu Vender',()=>{
    const user=bar();user.staffAccess={...user.staffAccess!,menus:['bar.receive'],actions:['bar.receive'],homePath:'/atendimento/receber'}
    expect(workHome(user)).toBe('/atendimento/receber')
    expect(barHome(user)).toBe('/atendimento/receber')
    expect(loginDestination(user,{pathname:'/atendimento/vender'})).toBe('/atendimento/receber')
  })
  it('bloqueia a operação desmarcada mesmo quando outra ação concede a permissão base',()=>{
    const user=bar();user.staffAccess!.actions=['bar.receive']
    expect(hasPermission(user,'bar:sales:operate')).toBe(true)
    expect(hasStaffAction(user,'bar.sell')).toBe(false)
    expect(staffPathAllowed(user,'/atendimento/vender')).toBe(false)
    expect(staffPathAllowed(user,'/atendimento/receber/uma-comanda')).toBe(true)
    expect(staffPathAllowed(user,'/atendimento/comandas')).toBe(true)
  })
  it('permite selecionar a turma pela visão Presenças sem abrir o cadastro geral',()=>{
    const user:AuthUser={id:'professor',name:'Professor',email:'',roles:['Teacher'],permissions:[],staffAccess:{typeId:'professor',name:'Professor',role:'Teacher',menus:['teaching.attendance'],actions:['teaching.presence'],homePath:'/professor/presencas'}}
    expect(staffPathAllowed(user,'/professor/presencas')).toBe(true)
    expect(staffPathAllowed(user,'/professor/turmas/minha-turma')).toBe(true)
    expect(staffPathAllowed(user,'/professor/turmas')).toBe(false)
    expect(staffPathAllowed(user,'/escola')).toBe(false)
    expect(staffPathAllowed(user,'/professor/conta')).toBe(true)
  })
  it('separa consultas auxiliares da permissão de abrir ou editar outro módulo',()=>{
    const user=bar();user.roles=['Operations'];user.permissions=['students:read','students:write','employees:read'];user.staffAccess={...user.staffAccess!,typeId:'atendente',menus:['enrollments'],actions:['enrollments.operate'],homePath:'/escola/matriculas'}
    expect(staffKindCanLoad(user,'students')).toBe(true)
    expect(staffKindCanLoad(user,'team')).toBe(true)
    expect(staffKindAllowed(user,'students')).toBe(false)
    expect(staffKindAllowed(user,'students',true)).toBe(false)
    expect(staffKindAllowed(user,'enrollments',true)).toBe(true)
  })
  it('abre Clientes e os detalhes somente quando o tipo permite',()=>{
    const user=bar();user.staffAccess={...user.staffAccess!,menus:['customers'],actions:['customers.operate'],homePath:'/clientes'}
    expect(staffPathAllowed(user,'/clientes')).toBe(true)
    expect(staffPathAllowed(user,'/clientes/pessoa')).toBe(true)
    expect(loginDestination(user,{pathname:'/clientes/pessoa'})).toBe('/clientes/pessoa')
    expect(staffPathAllowed(user,'/alunos')).toBe(false)
  })
  it('libera as notas fiscais pelo acesso específico de estoque',()=>{
    const user=bar();user.roles=['Manager'];user.staffAccess={...user.staffAccess!,role:'Manager',menus:['stock'],actions:['stock.operate','stock.fiscal'],homePath:'/bar/produtos'}
    expect(staffPathAllowed(user,'/notas-recebidas')).toBe(true)
    expect(staffPathAllowed(user,'/bar/notas-recebidas/nota')).toBe(true)
    expect(staffPathAllowed(user,'/financeiro')).toBe(false)
    user.staffAccess!.actions=['stock.operate']
    expect(staffPathAllowed(user,'/notas-recebidas')).toBe(false)
  })
  it('descarta um retorno de login externo ou de outro módulo',()=>{
    expect(loginDestination(bar(),{pathname:'/financeiro'})).toBe('/atendimento/vender')
    const user=bar();user.staffAccess!.homePath='//example.invalid'
    expect(workHome(user)).toBe('/conta')
  })
  it('muda a chave de dados ao revogar a autoridade ou mudar apenas menus',()=>{
    const user=bar();const original=staffScopeKey(user)
    expect(staffScopeKey({...user,canManageStaff:true})).not.toBe(original)
    expect(staffScopeKey({...user,staffAccess:{...user.staffAccess!,menus:['bar.tabs']}})).not.toBe(original)
    expect(staffScopeKey({...user,staffAccess:{...user.staffAccess!,actions:[]}})).not.toBe(original)
  })
})

it('Turmas concentra alunos, matrículas e presenças mantendo a ação de operação obrigatória',()=>{
 const user=bar();user.staffAccess!.menus=['classes'];user.staffAccess!.actions=[]
 for(const kind of ['students','enrollments','presences']) {
  expect(staffKindAllowed(user,kind)).toBe(true)
  expect(staffKindAllowed(user,kind,true)).toBe(false)
 }
 user.staffAccess!.actions=['classes.operate']
 for(const kind of ['students','enrollments','presences']) expect(staffKindAllowed(user,kind,true)).toBe(true)
 expect(staffKindAllowed(user,'financeEntries',true)).toBe(false)
 expect(staffKindAllowed(user,'team',true)).toBe(false)
})
