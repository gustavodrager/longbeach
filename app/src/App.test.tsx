import { render, screen, waitFor } from '@testing-library/react'
import { afterEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { App } from './App'
import { getCsrfToken, setAccessToken, setCsrfToken } from './lib/http'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('autenticação e shell', () => {
  beforeEach(() => {
    setAccessToken(null)
    setCsrfToken(null)
    localStorage.clear()
    sessionStorage.clear()
    document.cookie = 'lb_csrf=; Max-Age=0; Path=/'
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('abre a página inicial sem login em modo de teste e não chama a API', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    window.history.replaceState({}, '', '/')

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeInTheDocument()
    expect(screen.getByText(/Dados fictícios.*neste navegador/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Entre no Long Beach OS' })).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('redireciona a rota de login para a página inicial em modo de teste', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    window.history.replaceState({}, '', '/login')

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
  })

  it('cadastra um aluno e abre sua ficha com os dados de aula', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    window.history.replaceState({}, '', '/alunos/novo')
    render(<App />)
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Nome'), 'Aluno de teste')
    await user.clear(screen.getByLabelText('Aulas por semana'))
    await user.type(screen.getByLabelText('Aulas por semana'), '2')
    await user.type(screen.getByLabelText('Dias da semana'), 'Segunda-feira / Sábado')
    await user.type(screen.getByLabelText('Turma ou horário 1'), '19:00 até 20:00')
    await user.click(screen.getByRole('button', { name: 'Salvar cadastro' }))

    expect(await screen.findByRole('heading', { name: 'Aluno de teste' })).toBeInTheDocument()
    expect(screen.getByText('2x por semana')).toBeInTheDocument()
    expect(screen.getByText('19:00 até 20:00')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('longbeach-os-demo-v1') ?? '{}').students).toHaveLength(1)
  })

  it('sincroniza módulos com PostgreSQL no modo público de teste', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    vi.stubEnv('VITE_OPERATIONAL_STORAGE', 'postgres')
    vi.stubEnv('VITE_API_URL', 'https://api.longbeach.quebranunca.com.br')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (init?.method === 'PUT') return jsonResponse(JSON.parse(String(init.body)), 201)
      if (url.includes('/api/v1/operations/')) return jsonResponse([])
      throw new Error(`Requisição inesperada: ${url}`)
    })
    window.history.replaceState({}, '', '/alunos/novo')
    render(<App />)
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Nome'), 'Cadastro fictício PostgreSQL')
    await user.click(screen.getByRole('button', { name: 'Salvar cadastro' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/operations\/students\/[0-9a-f-]+$/),
      expect.objectContaining({ method: 'PUT' }),
    ))
    expect(await screen.findByText('Alterações salvas no PostgreSQL.')).toBeInTheDocument()
  })

  it('registra itens de estoque e permite entrada e baixa de uma unidade', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    window.history.replaceState({}, '', '/estoque')
    render(<App />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '+ Adicionar item' }))
    await user.type(screen.getByLabelText('Produto ou material'), 'Bola de teste')
    await user.clear(screen.getByLabelText('Quantidade atual'))
    await user.type(screen.getByLabelText('Quantidade atual'), '2')
    await user.click(screen.getByRole('button', { name: 'Salvar cadastro' }))
    expect(await screen.findByRole('heading', { name: 'Bola de teste' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retirar uma unidade de Bola de teste' }))
    expect(document.querySelector('.stock-number')).toHaveTextContent('1 unidade')
    expect(screen.getByText('Baixa')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    await user.clear(screen.getByLabelText('Avisar quando chegar a'))
    await user.type(screen.getByLabelText('Avisar quando chegar a'), '1')
    await user.click(screen.getByRole('button', { name: 'Salvar cadastro' }))
    expect(await screen.findByText(/Repor estoque/)).toBeInTheDocument()
  })

  it('cadastra uma pessoa da equipe com forma e frequência de pagamento', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    window.history.replaceState({}, '', '/equipe')
    render(<App />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '+ Adicionar pessoa' }))
    await user.type(screen.getByLabelText('Nome'), 'Professor de teste')
    await user.clear(screen.getByLabelText('Valor combinado (R$)'))
    await user.type(screen.getByLabelText('Valor combinado (R$)'), '80')
    await user.click(screen.getByRole('button', { name: 'Salvar cadastro' }))
    expect(await screen.findByText('Professor de teste')).toBeInTheDocument()
    expect(screen.getByText(/Por hora.*semanal/)).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('longbeach-os-demo-v1') ?? '{}').team).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    await user.clear(screen.getByLabelText('Nome'))
    await user.type(screen.getByLabelText('Nome'), 'Professor revisado')
    await user.click(screen.getByRole('button', { name: 'Salvar cadastro' }))
    expect(await screen.findByText('Professor revisado')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('longbeach-os-demo-v1') ?? '{}').team).toHaveLength(1)
  })

  it('cria um projeto e mostra prazo e acompanhamento de custos', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    window.history.replaceState({}, '', '/projetos')
    render(<App />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '+ Novo projeto' }))
    await user.type(screen.getByLabelText('Nome do projeto'), 'Reforma da quadra')
    await user.clear(screen.getByLabelText('Custo previsto (R$)'))
    await user.type(screen.getByLabelText('Custo previsto (R$)'), '2500')
    await user.click(screen.getByRole('button', { name: 'Salvar projeto' }))
    await user.click(await screen.findByRole('button', { name: /Reforma da quadra/ }))
    expect(document.querySelector('.project-detail')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('longbeach-os-demo-v1') ?? '{}').projects[0].estimatedCost).toBe(2500)
  })

  it('protege a área interna quando não há sessão', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({}, 401))
    window.history.replaceState({}, '', '/')

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Entre no Long Beach OS' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Visão geral' })).not.toBeInTheDocument()
  })

  it('entra pela API e apresenta o shell autenticado', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(
        jsonResponse({
          accessToken: 'access-token-de-teste',
          accessTokenExpiresAtUtc: '2026-10-01T16:00:00Z',
          csrfToken: 'csrf-login-de-teste',
          user: {
            id: 'user-1',
            name: 'Gustavo Drager',
            email: 'gustavo@example.com',
            roles: ['Owner'],
            permissions: ['arena.manage'],
          },
        }),
      )

    render(<App />)
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('E-mail'), 'gustavo@example.com')
    await user.type(screen.getByLabelText('Senha'), 'senha-segura')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeInTheDocument()
    expect(screen.getByText('Gustavo Drager')).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    const loginRequest = fetchMock.mock.calls[1]
    expect(loginRequest[0]).toBe('/api/v1/auth/login')
    expect(loginRequest[1]).toEqual(
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    )
    expect((loginRequest[1]?.headers as Headers).get('Authorization')).toBeNull()
    expect(getCsrfToken()).toBe('csrf-login-de-teste')
  })

  it('restaura a sessão com CSRF e substitui o token após a rotação', async () => {
    document.cookie = 'lb_csrf=csrf-anterior; Path=/'
    const authenticatedUser = {
      id: 'user-1',
      name: 'Gustavo Drager',
      email: 'gustavo@example.com',
      roles: ['Owner'],
      permissions: ['arena.manage'],
    }
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          accessToken: 'access-token-rotacionado',
          accessTokenExpiresAtUtc: '2026-10-01T16:15:00Z',
          csrfToken: 'csrf-rotacionado',
          user: authenticatedUser,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(authenticatedUser))

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeInTheDocument()
    const refreshRequest = fetchMock.mock.calls[0]
    expect(refreshRequest[0]).toBe('/api/v1/auth/refresh')
    expect((refreshRequest[1]?.headers as Headers).get('X-CSRF-Token')).toBe('csrf-anterior')
    expect(getCsrfToken()).toBe('csrf-rotacionado')
  })

  it('altera a senha pela área da conta e exige uma nova entrada', async () => {
    const authenticatedUser = {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Gustavo Drager',
      email: 'gustavo@example.com',
      roles: ['Owner'],
      permissions: ['arena.manage'],
    }
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          accessToken: 'access-token-atual',
          accessTokenExpiresAtUtc: '2026-10-01T16:15:00Z',
          csrfToken: 'csrf-atual',
          user: authenticatedUser,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(authenticatedUser))
      .mockResolvedValueOnce(
        jsonResponse({
          message: 'Password changed successfully. Sign in again with the new password.',
          requiresReauthentication: true,
        }),
      )

    window.history.replaceState({}, '', '/')
    render(<App />)
    const user = userEvent.setup()

    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeInTheDocument()
    await user.click(screen.getAllByRole('link', { name: 'Abrir configurações da conta' })[0])
    expect(await screen.findByRole('heading', { name: 'Segurança' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Senha atual'), 'AtualSenha2026!')
    await user.type(screen.getByLabelText('Nova senha'), 'NovaSenha2026!')
    await user.type(screen.getByLabelText('Confirmar nova senha'), 'NovaSenha2026!')
    await user.click(screen.getByRole('button', { name: 'Alterar senha' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Senha alterada. Entre novamente com a nova senha.',
    )
    expect(screen.getByRole('heading', { name: 'Entre no Long Beach OS' })).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))

    const changeRequest = fetchMock.mock.calls[2]
    expect(changeRequest[0]).toBe('/api/v1/auth/change-password')
    expect(changeRequest[1]).toEqual(expect.objectContaining({ method: 'POST' }))
    expect((changeRequest[1]?.headers as Headers).get('Authorization')).toBe(
      'Bearer access-token-atual',
    )
    expect(JSON.parse(changeRequest[1]?.body as string)).toEqual({
      currentPassword: 'AtualSenha2026!',
      newPassword: 'NovaSenha2026!',
    })
    expect(getCsrfToken()).toBeNull()
  })
})
