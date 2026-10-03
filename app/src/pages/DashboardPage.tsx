import { Link } from 'react-router-dom'
import { useOperations } from '../features/operations/DemoDataProvider'

const modules = [
  { title: 'Alunos', description: 'Cadastros, contato, turmas e pagamentos.', accent: 'teal', icon: '◎', href: '/alunos', count: 'students' },
  { title: 'Equipe', description: 'Funções e acordos de pagamento.', accent: 'gold', icon: '◇', href: '/equipe', count: 'team' },
  { title: 'Estoque', description: 'Material esportivo, limpeza e bar.', accent: 'sand', icon: '▦', href: '/estoque', count: 'inventory' },
  { title: 'Projetos', description: 'Planejamento, tarefas, prazos e custos.', accent: 'blue', icon: '◫', href: '/projetos', count: 'projects' },
]

export function DashboardPage() {
  const { students, team, inventory, projects } = useOperations()
  const counts = { students: students.length, team: team.length, inventory: inventory.length, projects: projects.length }
  const formattedDate = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(new Date())

  return (
    <main className="dashboard">
      <header className="page-heading">
        <div>
          <p className="eyebrow">{formattedDate}</p>
          <h1>Visão geral</h1>
          <p>Cadastre e acompanhe as rotinas principais da arena em um só lugar.</p>
        </div>
        <span className="foundation-status"><i aria-hidden="true" /> Área de teste</span>
      </header>

      <section className="foundation-card" aria-labelledby="foundation-title">
        <div>
          <span className="card-kicker">Dados deste navegador</span>
          <h2 id="foundation-title">A operação da arena, organizada por áreas.</h2>
          <p>Cadastros são salvos neste navegador e podem ser usados para testar os fluxos. Ainda não sincronizam com outros aparelhos.</p>
        </div>
        <div className="foundation-progress" aria-label="Etapa atual: fundação do sistema">
          <span>4 áreas disponíveis</span>
          <div><i /></div>
          <small>Alunos · equipe · estoque · projetos</small>
        </div>
      </section>

      <section aria-labelledby="modules-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Operação</p>
            <h2 id="modules-title">Módulos da arena</h2>
          </div>
          <span>Selecione uma área para começar</span>
        </div>
        <div className="module-grid">
          {modules.map((module) => (
            <Link className={`module-card ${module.accent}`} key={module.title} to={module.href}>
              <span className="module-icon" aria-hidden="true">{module.icon}</span>
              <div>
                <h3>{module.title}</h3>
                <p>{module.description}</p>
              </div>
              <span className="module-state">{counts[module.count as keyof typeof counts]} cadastrados · Abrir →</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
