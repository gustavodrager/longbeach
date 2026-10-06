import type { OperationalKind } from '../features/operations/DemoDataProvider'
import type { IconName } from './NavigationIcon'

export type Destination = { label: string; href: string; kind?: OperationalKind; permission?: string; owner?: boolean; related?: Destination[] }
export type NavigationGroup = Destination & { icon: IconName; children?: Destination[] }
export const managementNavigation: NavigationGroup[] = [
  { label: 'Início', icon: 'home', href: '/' },
  { label: 'Agenda', icon: 'calendar', href: '/agenda', kind: 'reservations', children: [
    { label: 'Agenda', href: '/agenda', kind: 'reservations' }, { label: 'Quadra e horários', href: '/quadras', kind: 'courts' },
  ] },
  { label: 'Mensalistas', icon: 'people', href: '/mensalistas', kind: 'rentalGroups' },
  { label: 'Escola', icon: 'school', href: '/escola', children: [
    { label: 'Turmas', href: '/escola', kind: 'classes' }, { label: 'Alunos', href: '/alunos', kind: 'students' },
    { label: 'Matrículas', href: '/escola/matriculas', kind: 'enrollments' }, { label: 'Presenças', href: '/escola/presencas', kind: 'presences' },
  ] },
  { label: 'Financeiro', icon: 'wallet', href: '/financeiro', children: [
    { label: 'Lançamentos', href: '/financeiro', kind: 'financeEntries' }, { label: 'Histórico', href: '/financeiro/historico', owner: true },
  ] },
  { label: 'Bar', icon: 'bar', href: '/bar/indicadores', children: [
    { label: 'Resumo', href: '/bar/indicadores', permission: 'bar:finance:read' },
    { label: 'Produtos', href: '/bar/produtos', permission: 'bar:catalog:write', related: [{ label: 'Fichas técnicas', href: '/bar/receitas', permission: 'bar:catalog:write' }] },
    { label: 'Estoque', href: '/bar/estoque', permission: 'bar:stock:read', related: [{ label: 'Inventário', href: '/bar/inventario', permission: 'bar:stock:manage' }, { label: 'Perdas e consumo', href: '/bar/perdas', permission: 'bar:stock:output' }] },
    { label: 'Compras', href: '/bar/compras', permission: 'bar:purchases:manage' },
    { label: 'Caixas', href: '/bar/caixa', permission: 'bar:supervise' },
    { label: 'Vendas', href: '/bar/vendas', permission: 'bar:sales:read', related: [{ label: 'Conciliação', href: '/bar/conciliacao', permission: 'bar:payments:reconcile' }] },
  ] },
  { label: 'Estrutura', icon: 'tools', href: '/equipe', children: [
    { label: 'Equipe', href: '/equipe', kind: 'team' }, { label: 'Materiais', href: '/estoque', kind: 'inventory' },
    { label: 'Projetos', href: '/projetos', kind: 'projects' }, { label: 'Manutenção', href: '/manutencao', kind: 'maintenance' },
  ] },
]
export const attendantNavigation: NavigationGroup[] = [
  { label: 'Vender', icon: 'plus', href: '/atendimento/vender', permission: 'bar:sales:operate' },
  { label: 'Comandas', icon: 'orders', href: '/atendimento/comandas', permission: 'bar:sales:read' },
  { label: 'Pedidos', icon: 'check', href: '/atendimento/pedidos', permission: 'bar:sales:operate' },
  { label: 'Meu caixa', icon: 'wallet', href: '/atendimento/caixa', permission: 'bar:cash:operate' },
]
export const routeMatches = (path: string, href: string) => path === href || href !== '/' && path.startsWith(href + '/')
export function destinationFor(path: string, groups: NavigationGroup[]) {
  const matches = groups.flatMap(group => (group.children ?? [group]).flatMap(item => [item, ...(item.related ?? [])].map(destination => ({ group, item, destination })))).filter(({ destination }) => routeMatches(path, destination.href)).sort((a, b) => b.destination.href.length - a.destination.href.length)
  return matches[0] ?? (path.startsWith('/bar/registros/') ? groups.filter(g => g.label === 'Bar').map(group => ({ group, item: group.children![0], destination: group.children![0] }))[0] : undefined)
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
