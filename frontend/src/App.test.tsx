import { render, screen, waitFor } from '@testing-library/react'
import { afterEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { App } from './App'
import { getCsrfToken, setAccessToken, setCsrfToken } from './lib/http'

vi.mock('./features/auth/GoogleSignInButton', () => ({ GoogleSignInButton: ({ onCredential }: { onCredential: (credential: string) => void }) => <button type="button" onClick={() => onCredential('verified-test-credential')}>Entrar com Google</button> }))

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function withOperationalReads(authHandler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    if (String(input).endsWith('/api/v1/auth/options')) return Promise.resolve(jsonResponse({ googleClientId: 'test-client', clientRegistrationEnabled: true }))
    if (String(input).split('?')[0].endsWith('/api/v1/expenses/paid-summary') && (!init?.method || init.method === 'GET')) return Promise.resolve(jsonResponse({ amount: 0, records: 0 }))
    if (String(input).endsWith('/api/v1/financial-history/current-position') && !init?.method) {
      const empty = { amountCents: 0, records: 0, overdueCents: 0, overdueRecords: 0, confirmedPaymentsCents: 0 }
      return Promise.resolve(jsonResponse({ date: '2026-10-13', readAtUtc: '2026-10-13T12:00:00Z', lastRecordChangeAtUtc: null, registeredEntries: 0, receivable: empty, payable: empty, currentBank: { amountCents: null, asOfUtc: null, status: 'NotConnected', issue: 'Saldo atual da conta não conectado.' }, entries: [] }))
    }
    if (String(input).includes('/api/v1/bar/tabs/reports/') && !init?.method) return Promise.resolve(jsonResponse({ value: 0, unit: 'money', current: true, updatedAtUtc: '2026-10-13T12:00:00Z', rows: { items: [], total: 0, page: 1, pageSize: 1 } }))
    if (String(input).includes('/api/v1/financial-history') && !init?.method) return Promise.resolve(jsonResponse({ month: '2026-08', months: [], items: [], totals: [], total: 0, page: 1 }))
    if (String(input).includes('/api/v1/operations/') && !init?.method) return Promise.resolve(jsonResponse([]))
    return authHandler(input, init)
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
    expect(screen.queryByRole('heading', { name: 'Entrar' })).not.toBeInTheDocument()
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

  it('cadastra material com saldo zero e registra movimentos com motivo e destino na demonstração local', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    window.history.replaceState({}, '', '/estoque')
    render(<App />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '+ Adicionar item' }))
    await user.type(await screen.findByLabelText('Material ou equipamento'), 'Bola de teste')
    await user.type(screen.getByLabelText('Onde fica guardado'), 'Depósito')
    expect(screen.queryByLabelText('Quantidade atual')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Salvar cadastro' }))
    expect(await screen.findByRole('heading', { name: 'Bola de teste' })).toBeInTheDocument()
    expect(document.querySelector('.stock-number')).toHaveTextContent('0 unidade')
    await user.click(screen.getByRole('button', { name: 'Movimentar' }))
    await user.type(screen.getByLabelText('Quantidade (unidade)'), '2')
    await user.type(screen.getByLabelText('Motivo ou documento de referência'), 'Reposição de teste')
    await user.type(screen.getByLabelText('Área ou responsável pelo destino'), 'Escola')
    await user.click(screen.getByRole('button', { name: 'Confirmar movimentação' }))
    await waitFor(() => expect(document.querySelector('.stock-number')).toHaveTextContent('2 unidade'))
    await user.click(screen.getByRole('button', { name: 'Movimentar' }))
    await user.selectOptions(screen.getByLabelText('Tipo de movimentação'), 'Loss')
    await user.type(screen.getByLabelText('Quantidade (unidade)'), '1')
    await user.type(screen.getByLabelText('Motivo ou documento de referência'), 'Dano de teste')
    await user.type(screen.getByLabelText('Área ou responsável pelo destino'), 'Descarte')
    await user.click(screen.getByRole('button', { name: 'Confirmar movimentação' }))
    await waitFor(() => expect(document.querySelector('.stock-number')).toHaveTextContent('1 unidade'))
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    await user.clear(screen.getByLabelText('Avisar quando chegar a'))
    await user.type(screen.getByLabelText('Avisar quando chegar a'), '1')
    await user.click(screen.getByRole('button', { name: 'Salvar cadastro' }))
    expect(await screen.findByText(/Repor estoque/)).toBeInTheDocument()
    const stored = JSON.parse(localStorage.getItem('longbeach-os-demo-v1') ?? '{}')
    expect(Object.values(stored.__materialOperations)).toHaveLength(2)
  })

  it('cadastra uma pessoa da equipe com forma e frequência de pagamento', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    window.history.replaceState({}, '', '/equipe')
    render(<App />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '+ Adicionar pessoa' }))
    await user.type(await screen.findByLabelText('Nome'), 'Professor de teste')
    await user.clear(screen.getByLabelText('Valor combinado (R$)'))
    await user.type(screen.getByLabelText('Valor combinado (R$)'), '80')
    await user.selectOptions(screen.getByLabelText('Base do valor'), 'Por hora')
    await user.selectOptions(screen.getByLabelText('Frequência de pagamento'), 'Semanal')
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
    await user.type(await screen.findByLabelText('Nome do projeto'), 'Reforma da quadra')
    await user.clear(screen.getByLabelText('Custo previsto (R$)'))
    await user.type(screen.getByLabelText('Custo previsto (R$)'), '2500')
    await user.click(screen.getByRole('button', { name: 'Salvar projeto' }))
    await user.click(await screen.findByRole('button', { name: /Reforma da quadra/ }))
    await waitFor(() => expect(document.querySelector('.project-detail')).toBeInTheDocument())
    expect(JSON.parse(localStorage.getItem('longbeach-os-demo-v1') ?? '{}').projects[0].estimatedCost).toBe(2500)
  })

  it('abre a experiência de visitante na raiz sem oferecer acesso interno', async () => {
    const requests = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => String(input).endsWith('/auth/refresh') ? jsonResponse({}, 401) : jsonResponse({ googleClientId: 'test-client', clientRegistrationEnabled: true }))
    window.history.replaceState({}, '', '/')

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Bem-vindo à Long Beach' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/visitante')
    expect(screen.getByRole('link', { name: 'Ver cardápio' })).toHaveAttribute('href', '/cardapio/apresentacao')
    expect(screen.queryByRole('heading', { name: 'Visão geral' })).not.toBeInTheDocument()
    expect(requests.mock.calls.every(([input]) => ['/api/v1/auth/refresh', '/api/v1/auth/options'].includes(String(input)))).toBe(true)
  })

  it('entra com Google pela API e apresenta o shell autenticado', async () => {
    window.history.replaceState({}, '', '/login')
    const authFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
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
            roles: ['Manager'],
            permissions: ['arena.manage'],
          },
        }),
      )
    withOperationalReads(authFetch)

    render(<App />)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Entrar com Google' }))

    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeInTheDocument()
    expect(screen.getByText('Gustavo Drager')).toBeInTheDocument()
    await waitFor(() => expect(authFetch).toHaveBeenCalledTimes(2))

    const loginRequest = authFetch.mock.calls[1]
    expect(loginRequest[0]).toBe('/api/v1/auth/google')
    expect(loginRequest[1]).toEqual(
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    )
    expect(new Headers(loginRequest[1]?.headers).get('Authorization')).toBe('Bearer verified-test-credential')
    expect(getCsrfToken()).toBe('csrf-login-de-teste')
  })

  it('visitante cadastra cliente pelo Google e chega à área pessoal sem privilégios internos', async () => {
    const client = { id: 'new-client', name: 'Cliente de teste', email: 'client@example.invalid', roles: ['Student'], permissions: [] }
    const requests = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const path = String(input)
      if (path.endsWith('/auth/refresh')) return jsonResponse({}, 401)
      if (path.endsWith('/auth/options')) return jsonResponse({ googleClientId: 'test-client', clientRegistrationEnabled: true })
      if (path.endsWith('/auth/google')) return jsonResponse({ accessToken: 'client-token', csrfToken: 'client-csrf', user: client })
      if (path.endsWith('/me/portal/profile')) return jsonResponse({ name: client.name, email: client.email, phone: '', reminders: false, links: [] })
      return jsonResponse([])
    })
    window.history.replaceState({}, '', '/')
    render(<App />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('link', { name: 'Criar conta' }))
    expect(await screen.findByRole('heading', { name: 'Criar conta' })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Entrar com Google' }))
    expect(await screen.findByRole('heading', { name: 'Olá, Cliente' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/minha-area')
    expect(screen.queryByRole('link', { name: 'Área de trabalho →' })).not.toBeInTheDocument()
    expect(requests.mock.calls.every(([input]) => String(input).startsWith('/api/v1/auth/') || String(input).startsWith('/api/v1/me/'))).toBe(true)
  })

  it('restaura a sessão com CSRF e substitui o token após a rotação', async () => {
    document.cookie = 'lb_csrf=csrf-anterior; Path=/'
    const authenticatedUser = {
      id: 'user-1',
      name: 'Gustavo Drager',
      email: 'gustavo@example.com',
      roles: ['Manager'],
      permissions: ['arena.manage'],
    }
    const authFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        jsonResponse({
          accessToken: 'access-token-rotacionado',
          accessTokenExpiresAtUtc: '2026-10-01T16:15:00Z',
          csrfToken: 'csrf-rotacionado',
          user: authenticatedUser,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(authenticatedUser))
    withOperationalReads(authFetch)

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeInTheDocument()
    const refreshRequest = authFetch.mock.calls[0]
    expect(refreshRequest[0]).toBe('/api/v1/auth/refresh')
    expect((refreshRequest[1]?.headers as Headers).get('X-CSRF-Token')).toBe('csrf-anterior')
    expect(getCsrfToken()).toBe('csrf-rotacionado')
  })

  it('altera a senha pela área da conta e exige uma nova entrada', async () => {
    const authenticatedUser = {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Gustavo Drager',
      email: 'gustavo@example.com',
      roles: ['Manager'],
      permissions: ['arena.manage'],
    }
    const authFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
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
    withOperationalReads(authFetch)

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

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument()
    await waitFor(() => expect(authFetch).toHaveBeenCalledTimes(3))

    const changeRequest = authFetch.mock.calls[2]
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

it('endereço antigo de funcionamento abre a página atual preservando parâmetros',async()=>{
 vi.stubEnv('VITE_DEMO_MODE','true');window.history.replaceState({},'', '/quadras?secao=precos#horarios');render(<App/>);
 await screen.findByRole('heading',{name:'Funcionamento e preços'});expect(window.location.pathname).toBe('/agenda/funcionamento');expect(window.location.search).toBe('?secao=precos');expect(window.location.hash).toBe('#horarios');vi.unstubAllEnvs()
})
