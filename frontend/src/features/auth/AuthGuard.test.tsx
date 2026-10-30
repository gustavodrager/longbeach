import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from './authContext'
import { AuthGuard } from './AuthGuard'
import type { AuthUser } from './types'

it.each([[], ['Manager', 'Teacher'], ['Owner'], ['Custom']].map(roles => ({ roles })))('impede abrir rotas autenticadas com perfis inválidos: $roles', ({ roles }) => {
  const user = { id: 'invalid-profile', roles: roles as AuthUser['roles'], permissions: ['users:manage'] } as AuthUser
  const auth = { user, isBootstrapping: false } as AuthContextValue
  render(<AuthContext.Provider value={auth}><MemoryRouter><Routes><Route element={<AuthGuard />}><Route index element={<h1>Conteúdo privado</h1>} /></Route></Routes></MemoryRouter></AuthContext.Provider>)
  expect(screen.getByRole('heading', { name: 'Acesso restrito' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Conteúdo privado' })).not.toBeInTheDocument()
})

it.each([
  { path: '/', heading: 'Entrada pública' },
  { path: '/agenda?date=2026-10-29#reserva', heading: 'Login necessário' },
])('anônimo em $path mantém a proteção e recebe a entrada adequada', ({ path, heading }) => {
  const auth = { user: null, isBootstrapping: false } as AuthContextValue
  render(<AuthContext.Provider value={auth}><MemoryRouter initialEntries={[path]}><Routes><Route element={<AuthGuard />}><Route path="/" element={<h1>Conteúdo privado</h1>} /><Route path="/agenda" element={<h1>Conteúdo privado</h1>} /></Route><Route path="/visitante" element={<h1>Entrada pública</h1>} /><Route path="/login" element={<h1>Login necessário</h1>} /></Routes></MemoryRouter></AuthContext.Provider>)
  expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Conteúdo privado' })).not.toBeInTheDocument()
})
