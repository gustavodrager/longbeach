import type { OperationalKind } from '../features/operations/DemoDataProvider'
import type { IconName } from './NavigationIcon'

export type Destination = { label: string; href: string; kind?: OperationalKind; permission?: string; anyPermission?: string[]; owner?: boolean; related?: Destination[] }
export type NavigationGroup = Destination & { icon: IconName; children?: Destination[] }
export const barNavigation: NavigationGroup[] = [
  { label: 'Vender', icon: 'plus', href: '/atendimento/vender', permission: 'bar:sales:operate' },
  { label: 'Comandas', icon: 'orders', href: '/atendimento/comandas', permission: 'bar:sales:read' },
  { label: 'Pedidos', icon: 'check', href: '/atendimento/pedidos', permission: 'bar:sales:operate' },
  { label: 'Caixa', icon: 'wallet', href: '/bar/caixa', anyPermission: ['bar:cash:operate', 'bar:supervise'] },
  { label: 'Produtos e estoque', icon: 'bar', href: '/bar/produtos', anyPermission: ['bar:catalog:write', 'bar:stock:read'] },
  { label: 'Compras', icon: 'wallet', href: '/bar/compras', permission: 'bar:purchases:manage' },
  { label: 'Resumo', icon: 'home', href: '/bar/indicadores', permission: 'bar:finance:read' },
]
export const attendantNavigation = barNavigation.slice(0, 4)
export const managementNavigation: NavigationGroup[] = [
  { label: 'Visão geral', icon: 'home', href: '/' },
  { label: 'Agenda', icon: 'calendar', href: '/agenda', kind: 'reservations', children: [
    { label: 'Agenda', href: '/agenda', kind: 'reservations' }, { label: 'Solicitações', href: '/solicitacoes-clientes', permission: 'portal:manage' }, { label: 'Funcionamento e preços', href: '/agenda/funcionamento', kind: 'courts' },
  ] },
  { label: 'Mensalistas', icon: 'people', href: '/mensalistas', kind: 'rentalGroups' },
  { label: 'Aulas', icon: 'school', href: '/escola', children: [
    { label: 'Turmas', href: '/escola', kind: 'classes' }, { label: 'Alunos', href: '/alunos', kind: 'students' },
    { label: 'Matrículas', href: '/escola/matriculas', kind: 'enrollments' }, { label: 'Presenças', href: '/escola/presencas', kind: 'presences' },
  ] },
  { label: 'Financeiro', icon: 'wallet', href: '/financeiro/despesas', children: [
    { label: 'Despesas e pagamentos', href: '/financeiro/despesas', kind: 'financeEntries' },
    { label: 'Recebimentos', href: '/recebimentos', permission: 'finance:read' }, { label: 'Lançamentos gerais', href: '/financeiro', kind: 'financeEntries' }, { label: 'Controle mensal', href: '/financeiro/controle-mensal', owner: true }, { label: 'Histórico', href: '/financeiro/historico', owner: true },
    { label: 'Notas recebidas', href: '/notas-recebidas', permission: 'fiscal:invoices:manage' },
  ] },
  { label: 'Bar', icon: 'bar', href: '/bar', children: barNavigation },
  { label: 'Administração', icon: 'tools', href: '/equipe', children: [
    { label: 'Equipe', href: '/equipe', kind: 'team', related: [{ label: 'Acesso dos professores', href: '/administracao/professores', owner: true }] }, { label: 'Importações', href: '/importacoes', owner: true }, { label: 'Materiais', href: '/administracao/materiais', kind: 'inventory' },
    { label: 'Projetos', href: '/projetos', kind: 'projects' }, { label: 'Manutenção', href: '/manutencao', kind: 'maintenance' },
  ] },
]
export const routeMatches = (path: string, href: string) => path === href || href !== '/' && path.startsWith(href + '/')
export function barNavigationPath(path: string) {
  if(['/bar/estoque','/bar/inventario','/bar/perdas','/bar/receitas'].some(prefix=>routeMatches(path,prefix))) return '/bar/produtos'
  if(['/bar/vendas','/atendimento/receber','/atendimento/comprovante','/atendimento/pagamento-online'].some(prefix=>routeMatches(path,prefix))) return '/atendimento/comandas'
  if(routeMatches(path,'/bar/registros')) return '/bar/indicadores'
  return path
}
export function destinationFor(path: string, groups: NavigationGroup[]) {
  const matches = groups.flatMap(group => (group.children ?? [group]).flatMap(item => [item, ...(item.related ?? [])].map(destination => ({ group, item, destination })))).filter(({ destination }) => routeMatches(path, destination.href)).sort((a, b) => b.destination.href.length - a.destination.href.length)
  if(matches[0]) return matches[0]
  const hidden = [
    ['/bar/receitas','Fichas técnicas','/bar/produtos'], ['/bar/estoque','Movimentações','/bar/produtos'],
    ['/bar/inventario','Contar estoque','/bar/produtos'], ['/bar/perdas','Perdas e consumo','/bar/produtos'],
    ['/bar/vendas','Vendas do fluxo anterior','/atendimento/comandas'], ['/bar/registros','Registros','/bar/indicadores'],
  ].find(([prefix])=>routeMatches(path,prefix))
  const group=groups.find(g=>g.label==='Bar'), item=group?.children?.find(c=>c.href===hidden?.[2])
  return hidden&&group&&item ? {group,item,destination:{label:hidden[1],href:hidden[0]}} : undefined
}
export function visibleNavigation(can: (destination: Destination) => boolean) {
  return managementNavigation.flatMap(group => {
    if (!group.children) return can(group) ? [group] : []
    const children = group.children.flatMap(item => {
      const related = item.related?.filter(can)
      return can(item) ? [{ ...item, related }] : related?.length ? [{ ...related[0], related: related.slice(1) }] : []
    })
    return children.length ? [{ ...group, href: children[0].href, children }] : []
  })
}
