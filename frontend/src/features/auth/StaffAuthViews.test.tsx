import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { AuthContext, type AuthContextValue } from './authContext'
import { AuthGuard } from './AuthGuard'
import { FirstAccessPage } from '../../pages/FirstAccessPage'
import { TeacherLayout } from '../teaching/TeachingPages'
import type { AuthUser } from './types'
const options=vi.hoisted(()=>vi.fn())
vi.mock('./authApi',()=>({getSignInOptions:options}))
const user:AuthUser={id:'professor',name:'Professor de teste',email:'',roles:['Teacher'],permissions:[],staffAccess:{typeId:'professor',name:'Professor',role:'Teacher',menus:['teaching.attendance'],actions:['teaching.presence'],homePath:'/professor/presencas'}}
function context(person:AuthUser):AuthContextValue{return {user:person,isBootstrapping:false,signIn:vi.fn(),signInWithGoogle:vi.fn(),signOut:vi.fn(),changePassword:vi.fn(),completeFirstAccessWithGoogle:vi.fn()}}
function wrap(element:React.ReactNode,person=user,path='/'){
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
  return render(<QueryClientProvider client={client}><AuthContext.Provider value={context(person)}><MemoryRouter initialEntries={[path]}>{element}</MemoryRouter></AuthContext.Provider></QueryClientProvider>)
}
beforeEach(()=>{vi.clearAllMocks();options.mockResolvedValue({googleClientId:'test.apps.googleusercontent.com'})})
it('exige senha da nova equipe sem oferecer conclusão pelo Google',()=>{
  wrap(<FirstAccessPage/>,{...user,roles:[],requiresFirstAccess:true,requiresLocalPasswordChange:true,phoneLogin:'5511999998888'},'/primeiro-acesso')
  expect(screen.getByLabelText('Senha inicial')).toBeVisible()
  expect(screen.getByLabelText('Nova senha')).toBeVisible()
  expect(screen.getByText('Criar senha').closest('details')).toHaveAttribute('open')
  expect(screen.queryByLabelText('Vincular Google')).not.toBeInTheDocument()
  expect(screen.queryByText('Consultando acesso Google…')).not.toBeInTheDocument()
  expect(options).not.toHaveBeenCalled()
})
it('nega a URL financeira antes de montar seu conteúdo',()=>{
  wrap(<Routes><Route element={<AuthGuard/>}><Route path="/financeiro" element={<p>Dados financeiros privados</p>}/></Route></Routes>,user,'/financeiro')
  expect(screen.getByRole('heading',{name:'Acesso restrito'})).toBeVisible()
  expect(screen.queryByText('Dados financeiros privados')).not.toBeInTheDocument()
})
it('mostra somente a área de aulas liberada e segurança ao professor gerenciado',()=>{
  wrap(<Routes><Route path="/professor" element={<TeacherLayout/>}><Route path="presencas" element={<p>Minha chamada</p>}/></Route></Routes>,user,'/professor/presencas')
  expect(screen.getByRole('link',{name:'Presenças'})).toBeVisible()
  expect(screen.queryByRole('link',{name:'Hoje'})).not.toBeInTheDocument()
  expect(screen.queryByRole('link',{name:/^Turmas$/})).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Conta'}))
  expect(screen.getByRole('link',{name:'Segurança'})).toHaveAttribute('href','/professor/conta')
  expect(screen.queryByRole('link',{name:'Minha área'})).not.toBeInTheDocument()
})
