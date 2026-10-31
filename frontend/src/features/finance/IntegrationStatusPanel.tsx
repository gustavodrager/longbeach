import { Link } from 'react-router-dom'
import { isManagement } from '../auth/access'
import { useAuth } from '../auth/authContext'

export function IntegrationStatusPanel() {
  const { user } = useAuth()
  if (!isManagement(user)) return null
  return <section className="foundation-card source-status" aria-labelledby="integration-status-title">
    <h2 id="integration-status-title">Extratos e saldos por importação</h2>
    <p>Atualização por arquivos. Conexões automáticas C6, PagBank e PagVendas suspensas.</p><p>Saldos mantêm a data da fonte; não são atualizados em tempo real. Importar movimentos não confirma pagamentos nem cria receitas.</p>
    <div className="arena-actions"><Link to="/importacoes">Importar extratos</Link><Link to="/financeiro/historico?series=c6-conta">Conferir extrato C6</Link><Link to="/financeiro/historico?series=pagbank-conta">Conferir movimentos PagBank</Link><Link to="/recebimentos">Ver pagamentos</Link></div>
  </section>
}
