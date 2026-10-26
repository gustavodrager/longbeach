import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from './AppShell'
import { AuthContext, type AuthContextValue } from '../features/auth/authContext'
import type { AuthUser } from '../features/auth/types'
const operations=vi.hoisted(()=>({reload:vi.fn(async()=>{}),persistenceStatus:'connected',persistenceMessage:'',refreshFailed:false}))
vi.mock('../features/operations/DemoDataProvider',()=>({useOperations:()=>({...operations,canRead:()=>false})}))
vi.mock('../features/attendance/api',()=>({useBarData:()=>({data:{total:2}})}))
beforeEach(()=>{operations.reload.mockClear();operations.persistenceStatus='connected';operations.persistenceMessage='';operations.refreshFailed=false})
const owner:AuthUser={id:'test',name:'Teste',email:'test@example.invalid',roles:['Owner'],permissions:[]}
function mount(user=owner,path='/bar/produtos'){
 const router=createMemoryRouter([{element:<AppShell/>,children:[{path:'*',element:<h1>Conteúdo</h1>}]}],{initialEntries:[path]})
 render(<QueryClientProvider client={new QueryClient()}><AuthContext.Provider value={{user,signOut:async()=>{}} as AuthContextValue}><RouterProvider router={router}/></AuthContext.Provider></QueryClientProvider>);return router
}
it('usa o mesmo menu em gestão e atendimento, com cinco acessos móveis e secundários em Mais',async()=>{
 const router=mount();const nav=within(screen.getByRole('navigation',{name:'Atendimento para celular'}))
 expect(nav.getAllByRole('link').map(link=>link.textContent)).toEqual(['Vender','Comandas','Pedidos2','Caixa'])
 await userEvent.click(nav.getByRole('button',{name:'Mais'}))
 const dialog=within(screen.getByRole('dialog',{name:'Mais opções do Bar'}))
 expect(dialog.getByRole('link',{name:'Produtos e estoque'})).toHaveAttribute('href','/bar/produtos')
 expect(dialog.getByRole('link',{name:'Compras'})).toBeInTheDocument()
 expect(dialog.queryByRole('link',{name:'Fichas técnicas'})).not.toBeInTheDocument()
 await userEvent.click(dialog.getByRole('link',{name:'Compras'}))
 expect(router.state.location.pathname).toBe('/bar/compras');expect(screen.queryByRole('dialog')).not.toBeInTheDocument();router.dispose()
})
it('não oferece cadastros ou gestão de caixa ao atendente',()=>{
 const router=mount({...owner,roles:['BarOperator'],permissions:['bar:catalog:read','bar:sales:operate','bar:sales:read','bar:cash:operate']},'/atendimento/vender')
 const nav=within(screen.getByRole('navigation',{name:'Atendimento'}))
 expect(nav.queryByRole('link',{name:'Produtos e estoque'})).not.toBeInTheDocument()
 expect(nav.getByRole('link',{name:'Caixa'})).toHaveAttribute('href','/bar/caixa')
 expect(screen.queryByRole('button',{name:'Mais'})).not.toBeInTheDocument();router.dispose()
})
it('mantém acesso ao estoque sem liberar vendas ou cadastro de produtos',async()=>{
 const router=mount({...owner,roles:['StockManager'],permissions:['bar:stock:read']})
 const nav=within(screen.getByRole('navigation',{name:'Atendimento'}))
 expect(nav.getAllByRole('link')).toHaveLength(1)
 expect(nav.getByRole('link',{name:'Produtos e estoque'})).toBeInTheDocument()
 await userEvent.click(screen.getByRole('button',{name:'Mais'}))
 expect(within(screen.getByRole('dialog')).queryByRole('link',{name:'Compras'})).not.toBeInTheDocument();router.dispose()
})


it.each(['/','/recebimentos','/importacoes','/conta'])('mantém cabeçalho e navegação sem botão global de atualização em %s',path=>{
 const router=mount(owner,path)
 expect(screen.getByRole('navigation',{name:'Localização'})).toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'Atualizar dados'})).not.toBeInTheDocument()
 expect(operations.reload).not.toHaveBeenCalled()
 router.dispose()
})

it('preserva a tentativa local de recuperação quando os registros falham',async()=>{
 operations.persistenceStatus='error';operations.persistenceMessage='Falha ao carregar registros.'
 const router=mount(owner,'/')
 expect(screen.getByRole('alert')).toHaveTextContent('Falha ao carregar registros.')
 await userEvent.click(screen.getByRole('button',{name:'Tentar novamente'}))
 expect(operations.reload).toHaveBeenCalledTimes(1)
 expect(screen.queryByRole('button',{name:'Atualizar dados'})).not.toBeInTheDocument()
 router.dispose()
})
