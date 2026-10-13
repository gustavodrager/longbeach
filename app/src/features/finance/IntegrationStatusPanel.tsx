import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/http'
import { isManagement } from '../auth/access'
import { useAuth } from '../auth/authContext'

type Integration = {
  provider: string; state: string; detail: string; lastSuccessUtc: string | null
  failureCode: string | null; completeThrough: string | null
  environment?: string | null; requirements?: string[] | null
}

export function IntegrationStatusPanel() {
  const { user } = useAuth()
  const query = useQuery({
    queryKey: ['financial-integrations', user?.id],
    queryFn: () => apiFetch<Integration[]>('/api/v1/financial-history/integrations'),
    enabled: Boolean(isManagement(user)), refetchInterval: 60_000,
  })
  if (!isManagement(user)) return null
  return <section className="foundation-card source-status" aria-labelledby="integration-status-title">
    <h2 id="integration-status-title">Conexões PagBank e PagVendas</h2>
    <p>Confira os recursos configurados neste ambiente e as pendências para usá-los. Configuração preenchida ainda precisa ser validada com o provedor.</p>
    {query.isPending && <p role="status">Conferindo integrações…</p>}
    {query.isError && <p role="alert">Não foi possível atualizar as integrações. <button type="button" onClick={() => void query.refetch()}>Tentar novamente</button></p>}
    {!query.isError && query.data?.map(item => <article key={item.provider}>
      <h3>{item.provider} · {item.state}</h3>
      {item.environment && <p>Ambiente: {item.environment}</p>}
      <p>{item.detail}</p>
      {item.lastSuccessUtc && <p>Última leitura concluída: {new Date(item.lastSuccessUtc).toLocaleString('pt-BR')}</p>}
      {item.completeThrough && <p>Histórico completo até {item.completeThrough.split('-').reverse().join('/')}</p>}
      {item.failureCode && <p role="alert">A atualização requer atenção. Referência: {item.failureCode}</p>}
      {item.requirements && item.requirements.length > 0 && <><h4>Pendências e próximos passos</h4><ul>{item.requirements.map(requirement => <li key={requirement}>{requirement}</li>)}</ul></>}
    </article>)}
    <div className="arena-actions"><Link to="/importacoes">Conferir arquivos do PagVendas</Link><Link to="/recebimentos/conciliacao">Conciliar recebimentos</Link><Link to="/bar/estoque">Conferir estoque do bar</Link></div>
  </section>
}
