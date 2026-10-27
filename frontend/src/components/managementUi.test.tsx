import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Link, RouterProvider, useNavigate } from 'react-router-dom'
import { EditorPanel, UnsavedChangesProvider, useUnsavedChanges, safeReturn, useEditorQuery, useSection } from './managementUi'
import { destinationFor, managementNavigation, visibleNavigation } from './navigation'
import { Breadcrumb, DetailList, Search, useFilters } from '../pages/arenaUi'

it('preserva a turma de origem e competência ao trocar seções e editar a ficha', async () => {
  function Record(){const [editing,setEditing]=useEditorQuery(false,'student');const [section,setSection]=useSection(['aulas','cadastro']);return <><Breadcrumb to="/alunos" label="Alunos"/><button onClick={()=>setSection('cadastro')}>{section}</button><button onClick={()=>setEditing(!editing)}>{editing?'Concluir':'Editar'}</button></>}
  const router=createMemoryRouter([{path:'/alunos/:id',element:<Record/>}],{initialEntries:[{pathname:'/alunos/student',search:'?month=2026-10',state:{returnTo:'/escola/turma?month=2026-10',returnLabel:'Turma de teste'}}]})
  render(<RouterProvider router={router}/>)
  fireEvent.click(screen.getByText('aulas'))
  fireEvent.click(screen.getByText('Editar'))
  fireEvent.click(screen.getByText('Concluir'))
  expect(screen.getByRole('link',{name:'← Turma de teste'})).toHaveAttribute('href','/escola/turma?month=2026-10')
  expect(router.state.location.search).toBe('?month=2026-10&secao=cadastro')
  router.dispose()
})

it('organiza os grupos da gestão e mantém uma única seção ativa para rotas profundas', () => {
  expect(managementNavigation.map(x => x.label)).toEqual(['Visão geral','Agenda','Mensalistas','Aulas','Financeiro','Bar','Administração'])
  expect(destinationFor('/bar/receitas/produto',managementNavigation)?.destination.label).toBe('Fichas técnicas')
  expect(destinationFor('/escola/matriculas',managementNavigation)?.item.label).toBe('Matrículas')
  expect(destinationFor('/financeiro/historico',managementNavigation)?.destination.label).toBe('Histórico')
  expect(visibleNavigation(item => !item.owner && item.kind === 'students').flatMap(g => g.children ?? [g]).map(x=>x.label)).toEqual(['Alunos'])
})

it('mantém zero e recusa retornos externos', () => {
  render(<DetailList items={[["Quantidade",0],["Sem valor",null]]}/>)
  expect(screen.getByText('0')).toBeInTheDocument()
  expect(safeReturn('/escola/turma?month=2026-10')).toBe(true)
  expect(safeReturn('//example.com')).toBe(false)
  expect(safeReturn('/agenda\\evil')).toBe(false)
})

it('busca substitui a URL sem criar uma etapa por letra no histórico', async () => {
  function List(){const f=useFilters();const navigate=useNavigate();return <><Search filters={f}/><button onClick={()=>navigate(-1)}>Voltar</button></>}
  const router=createMemoryRouter([{path:'/origem',element:<h1>Origem</h1>},{path:'/lista',element:<List/>}],{initialEntries:['/origem','/lista'],initialIndex:1})
  render(<RouterProvider router={router}/>)
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'a'}})
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'agua'}})
  expect(router.state.location.search).toBe('?q=agua')
  fireEvent.click(screen.getByText('Voltar'))
  expect(await screen.findByRole('heading',{name:'Origem'})).toBeInTheDocument()
  router.dispose()
})

it('protege o formulário ao voltar e libera a navegação depois de salvar', async () => {
  function Form(){const guard=useUnsavedChanges();const navigate=useNavigate();return <EditorPanel title="Editar cadastro" onClose={()=>navigate('/lista')}><form onSubmit={e=>{e.preventDefault();guard.markSaved();navigate('/lista')}}><label>Nome<input/></label><Link to="/lista">Voltar à lista</Link><button>Salvar</button></form></EditorPanel>}
  function Content(){return <UnsavedChangesProvider><Form/></UnsavedChangesProvider>}
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
  const router=createMemoryRouter([{path:'/editar',element:<Content/>},{path:'/lista',element:<h1>Lista</h1>}],{initialEntries:['/editar']})
  render(<RouterProvider router={router}/>)
  fireEvent.change(screen.getByLabelText('Nome'),{target:{value:'Nome alterado'}})
  fireEvent.click(screen.getByText('Voltar à lista'))
  await waitFor(()=>expect(confirm).toHaveBeenCalledTimes(1))
  expect(screen.getByLabelText('Nome')).toHaveValue('Nome alterado')
  fireEvent.click(screen.getByText('Salvar'))
  expect(await screen.findByRole('heading',{name:'Lista'})).toBeInTheDocument()
  expect(confirm).toHaveBeenCalledTimes(1)
  router.dispose()
})
