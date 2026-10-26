import { Link } from 'react-router-dom'
import { isManagement } from '../auth/access'
import { useAuth } from '../auth/authContext'

export function IntegrationStatusPanel() {
  const { user } = useAuth()
  if (!isManagement(user)) return null
  return <section className="foundation-card source-status" aria-labelledby="integration-status-title">
    <h2 id="integration-status-title">Extratos e saldos por importação</h2>
    <p>As conexões automáticas C6, PagBank e PagVendas estão suspensas. Atualize extratos, movimentos e saldos por arquivos importados.</p>
    <p>Cada valor preserva a data e a origem da fonte. Atualizar a página consulta os registros do Long Beach; os saldos importados não acompanham o banco em tempo real.</p>
    <p>Importar movimentos não confirma pagamentos nem cria novas receitas. Documentos já registrados permanecem no histórico.</p>
    <div className="arena-actions"><Link to="/importacoes">Importar extratos</Link><Link to="/financeiro/historico?series=c6-conta">Conferir extrato C6</Link><Link to="/financeiro/historico?series=pagbank-conta">Conferir movimentos PagBank</Link><Link to="/recebimentos">Ver pagamentos</Link></div>
  </section>
}
