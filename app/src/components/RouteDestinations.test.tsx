import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../features/auth/authContext'
import type { AuthUser } from '../features/auth/types'
import { barHome } from '../features/auth/access'
import { LegacyDestination, MissingDestination } from './RouteDestinations'
import { destinationFor, managementNavigation, visibleNavigation } from './navigation'

it.each([
  ['/quadras', '/agenda/funcionamento', undefined],
  ['/estoque', '/administracao/materiais', undefined],
  ['/estoque/:itemId', '/administracao/materiais', 'itemId'],
  ['/escola/:classId', '/escola/turmas', 'classId'],
  ['/minhas-contas', '/minha-area/pagamentos', undefined],
])('redireciona %s preservando filtros, âncora e retorno sem adicionar histórico', async (path, to, parameter) => {
  function Destination() { const location = useLocation(); return <h1>{location.state?.returnLabel}</h1> }
  const url = path.replace(/:[a-zA-Z]+/, 'registro-1') + '?month=2026-10&acao=editar#detalhes'
  const router = createMemoryRouter([{ path:'/origem', element:<h1>Origem</h1> }, { path, element:<LegacyDestination to={to} parameter={parameter}/> }, { path:to+(parameter?'/:id':''), element:<Destination/> }], {initialEntries:['/origem',{pathname:url.split('?')[0],search:'?month=2026-10&acao=editar',hash:'#detalhes',state:{returnLabel:'Turma de origem',returnTo:'/escola'}}],initialIndex:1})
  render(<RouterProvider router={router}/>);await screen.findByRole('heading',{name:'Turma de origem'})
  expect(router.state.location.pathname).toBe(to+(parameter?'/registro-1':''));expect(router.state.location.search).toBe('?month=2026-10&acao=editar');expect(router.state.location.hash).toBe('#detalhes');expect(router.state.location.state.returnTo).toBe('/escola')
  await router.navigate(-1);await screen.findByRole('heading',{name:'Origem'});router.dispose()
})
it('entrada do bar respeita perfil e permissões efetivas', () => {
  const user:AuthUser={id:'test',name:'Teste',email:'test@example.invalid',roles:['BarOperator'],permissions:['bar:catalog:read','bar:sales:operate','bar:finance:read']}
  expect(barHome(user)).toBe('/atendimento/vender');expect(barHome({...user,roles:['Manager'],permissions:[]})).toBe('/bar/indicadores')
  expect(barHome({...user,roles:['BarFinance'],permissions:['bar:finance:read']})).toBe('/bar/indicadores')
  expect(barHome({...user,roles:['StockManager'],permissions:['bar:stock:read']})).toBe('/bar/estoque')
  expect(barHome({...user,roles:['Student']})).toBeNull();expect(barHome({...user,roles:['Teacher']})).toBeNull()
})
it('menus apontam para destinos canônicos e mantêm seções profundas identificadas',()=>{
  expect(destinationFor('/administracao/materiais/item',managementNavigation)?.destination.label).toBe('Materiais')
  expect(destinationFor('/agenda/funcionamento',managementNavigation)?.destination.label).toBe('Funcionamento e preços')
  expect(destinationFor('/recebimentos/conciliacao',managementNavigation)?.destination.label).toBe('Conciliação PagBank')
  expect(destinationFor('/administracao/professores',managementNavigation)?.item.label).toBe('Equipe')
  const hrefs=visibleNavigation(()=>true).flatMap(g=>(g.children??[g]).flatMap(c=>[c.href,...(c.related??[]).map(r=>r.href)]))
  expect(new Set(hrefs).size).toBe(hrefs.length);expect(hrefs).not.toContain('/estoque');expect(hrefs).not.toContain('/quadras')
})
it('endereço inexistente orienta o cliente sem abrir a gestão',async()=>{
 const user:AuthUser={id:'client',name:'Cliente',email:'client@example.invalid',roles:['Student'],permissions:[]}
 const auth={user,isBootstrapping:false} as AuthContextValue
 const router=createMemoryRouter([{path:'*',element:<AuthContext.Provider value={auth}><MissingDestination/></AuthContext.Provider>}],{initialEntries:['/nao-existe']})
 render(<RouterProvider router={router}/>);expect(screen.getByRole('heading',{name:'Página não encontrada'})).toBeInTheDocument();await waitFor(()=>expect(screen.getByRole('link',{name:'Voltar à minha área'})).toHaveAttribute('href','/minha-area'));expect(router.state.location.pathname).toBe('/nao-existe');router.dispose()
})
