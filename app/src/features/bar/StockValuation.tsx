import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Disclosure, RecordTable } from '../../components/managementUi'
import { ApiError, apiFetch } from '../../lib/http'
import { quantity } from '../../pages/arenaUi'
import { useAuth } from '../auth/authContext'
import { dateTime, money } from '../attendance/api'
import './stock-valuation.css'

export type StockValueRow = {
  productId: string; name: string; unit: string; quantity: number; reserved: number; available: number
  unitCost: number | null; costStatus: 'missing' | 'incomplete' | 'registered'; salePrice: number
  saleStatus: 'direct' | 'inactive' | 'untracked' | 'prepared' | 'no-price'
  stockCost: number | null; salePotential: number | null; grossProfit: number | null
}
export type StockValue = {
  locationId: string; locationName: string; updatedAtUtc: string; stockCost: number; salePotential: number
  comparableSalePotential: number; comparableCost: number; grossProfit: number | null; grossMarginPercent: number | null
  missingCostProducts: number; incompleteCostProducts: number; saleProducts: number; excludedSaleProducts: number; rows: StockValueRow[]
}
const percent = (value: number) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value)}%`
const saleReasons: Record<StockValueRow['saleStatus'], string> = {
  direct: 'Venda direta', inactive: 'Produto inativo', untracked: 'Sem controle de estoque', prepared: 'Depende de ficha técnica', 'no-price': 'Sem preço de venda',
}
const costLabels = { missing: 'Custo não informado', incomplete: 'Custo a conferir', registered: 'Custo médio cadastrado' }

function StockComposition({ data }: { data: StockValue }) {
  const [params, setParams] = useSearchParams()
  const search = params.get('estoqueBusca') || ''; const gapsOnly = params.get('estoqueFiltro') === 'custos'
  const filtered = data.rows.filter(row => row.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')) && (!gapsOnly || row.costStatus !== 'registered'))
  const pages = Math.max(1, Math.ceil(filtered.length / 12)); const page = Math.max(1, Math.min(pages, Math.floor(Number(params.get('estoquePagina')) || 1)))
  const update = (key: string, value: string) => { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); if (key !== 'estoquePagina') next.delete('estoquePagina'); setParams(next, { replace: true, preventScrollReset: true }) }
  return <>
    <div className="stock-value-filters">
      <label className="operation-field">Buscar no estoque<input type="search" value={search} onChange={event => update('estoqueBusca', event.target.value)} placeholder="Nome do produto" /></label>
      <label className="operation-field">Conferência de custos<select value={gapsOnly ? 'custos' : ''} onChange={event => update('estoqueFiltro', event.target.value)}><option value="">Todos os produtos</option><option value="custos">Custos pendentes de conferência</option></select></label>
    </div>
    <p className="arena-hint">{filtered.length} produtos · valores totais por produto. Quantidades em suas respectivas unidades.</p>
    {filtered.length ? <RecordTable label="Valor do estoque por produto" columns={['Produto', 'Estoque físico', 'Disponível', 'Custo no estoque', 'Venda potencial', 'Lucro bruto']} rows={filtered.slice((page - 1) * 12, page * 12).map(row => ({ key: row.productId, cells: [
      <><strong>{row.name}</strong><small>{row.saleStatus === 'direct' ? `${money(row.salePrice)} / ${row.unit}` : saleReasons[row.saleStatus]}</small></>,
      `${quantity(row.quantity)} ${row.unit}`,
      <>{quantity(row.available)} {row.unit}{row.reserved > 0 && <small>{quantity(row.reserved)} {row.unit} reservados</small>}</>,
      <>{row.stockCost === null ? 'Não informado' : money(row.stockCost)}<small>{costLabels[row.costStatus]}</small></>,
      row.salePotential === null ? 'Não projetada' : money(row.salePotential),
      row.grossProfit === null ? row.saleStatus === 'direct' ? 'Aguardando custo' : 'Não projetado' : money(row.grossProfit),
    ] }))} /> : <p className="empty-state">Nenhum produto nesta seleção.</p>}
    {pages > 1 && <nav className="arena-pagination" aria-label="Páginas da composição do estoque"><button className="secondary-link" disabled={page === 1} onClick={() => update('estoquePagina', String(page - 1))}>Anterior</button><span>{page} de {pages}</span><button className="secondary-link" disabled={page === pages} onClick={() => update('estoquePagina', String(page + 1))}>Próxima</button></nav>}
  </>
}

export function StockValuation({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth(); const [params] = useSearchParams()
  const allowed = Boolean(user?.permissions.includes('bar:finance:read'))
  const query = useQuery({ queryKey: ['bar-runtime', user?.id, '/stock/valuation'], queryFn: () => apiFetch<StockValue>('/api/v1/bar/stock/valuation'), enabled: allowed, refetchInterval: 30_000 })
  const accessLost = query.error instanceof ApiError && [401, 403].includes(query.error.status)
  const data = accessLost ? undefined : query.data
  if (!allowed) return null
  const missing = (data?.missingCostProducts ?? 0) + (data?.incompleteCostProducts ?? 0)
  const partialProfit = Boolean(data && data.comparableSalePotential < data.salePotential)
  const coverage = data && data.salePotential > 0 ? data.comparableSalePotential / data.salePotential * 100 : null
  return <section className="arena-dashboard-section stock-valuation" aria-labelledby="stock-value-title">
    <div className="arena-section-heading"><div><p className="arena-section-eyebrow">Bar · estoque e potencial</p><h2 id="stock-value-title">Valor do estoque</h2></div>{compact ? <Link className="arena-link-label" to="/bar/indicadores?estoque=detalhes">Ver composição e margem →</Link> : <Link className="arena-link-label" to="/bar/estoque">Abrir estoque →</Link>}</div>
    <p className="arena-hint stock-value-context">Estoque atual do Bar · independente do período selecionado{data && ` · Atualizado: ${dateTime(data.updatedAtUtc)}`}</p>
    {query.isLoading && <p role="status">Calculando o valor do estoque…</p>}
    {query.isError && <div className="arena-message arena-error" role="alert"><p>{data ? 'Não foi possível atualizar. Os valores abaixo são da última consulta.' : 'Não foi possível consultar o valor do estoque.'}</p><button className="secondary-link" onClick={() => void query.refetch()}>Atualizar estoque</button></div>}
    {data && <>
      {data.rows.length === 0 ? <p className="empty-state">O Bar ainda não tem saldo físico em estoque. Registre uma contagem ou o recebimento de uma compra para acompanhar os valores.</p> : <>
        <div className="arena-metric-grid stock-value-cards">
          <article className="arena-metric"><span className="arena-metric-label">Estoque a custo</span><strong>{data.rows.some(row => row.stockCost !== null) ? money(data.stockCost) : 'Aguardando custos'}</strong><small>{missing ? 'Parcial · custos pendentes de conferência' : 'Custo médio cadastrado'}</small><small>Inclui insumos e quantidades reservadas.</small></article>
          <article className="arena-metric"><span className="arena-metric-label">Potencial de venda</span><strong>{money(data.salePotential)}</strong><small>{data.saleProducts} produtos disponíveis para venda direta</small><small>Quantidade disponível × preço atual.</small></article>
          <article className={`arena-metric stock-value-profit${data.grossProfit !== null && data.grossProfit < 0 ? ' stock-value-loss' : ''}`}><span className="arena-metric-label">Lucro bruto estimado</span><strong>{data.grossProfit === null ? 'Aguardando custos' : money(data.grossProfit)}</strong><small>{partialProfit ? 'Parcial · só produtos com base de custo completa' : 'Venda potencial menos custo dos mesmos produtos'}</small><small>Antes de taxas, impostos e despesas.</small></article>
          {!compact && <article className="arena-metric"><span className="arena-metric-label">Margem bruta estimada</span><strong>{data.grossMarginPercent === null ? 'Não calculável' : percent(data.grossMarginPercent)}</strong><small>{partialProfit ? 'Sobre a parcela com base de custo completa' : 'Lucro bruto ÷ venda potencial'}</small><small>Margem sobre a venda, não sobre o custo.</small></article>}
        </div>
        {missing > 0 && <p className="stock-value-notice">{data.missingCostProducts > 0 && <>{data.missingCostProducts} {data.missingCostProducts === 1 ? 'produto sem custo informado.' : 'produtos sem custo informado.'} </>}{data.incompleteCostProducts > 0 && <>{data.incompleteCostProducts} {data.incompleteCostProducts === 1 ? 'produto com entradas anteriores sem custo,' : 'produtos com entradas anteriores sem custo,'} que podem reduzir a média. </>}Esses produtos ficam fora do lucro estimado até a conferência.</p>}
        {!compact && <>
          <div className="stock-value-basis"><div><strong>Base do lucro estimado</strong><p>{money(data.comparableSalePotential)} em venda − {money(data.comparableCost)} em custo{data.grossProfit !== null && ` = ${money(data.grossProfit)}`}</p></div>{coverage !== null && <div className="stock-value-coverage"><span>{percent(coverage)} do potencial de venda com base de custo completa</span><progress max="100" value={coverage} aria-label="Cobertura de custos para a projeção" /></div>}</div>
          <Disclosure title="Ver composição por produto" open={params.get('estoque') === 'detalhes'} lazy><StockComposition data={data} /></Disclosure>
        </>}
      </>}
      {!compact && <Disclosure title="Como calculamos estes valores" lazy><p>O custo do estoque usa a quantidade física e o custo médio cadastrado, mantendo os centavos das compras. Produtos sem custo ficam identificados; o total conhecido é parcial.</p><p>O potencial de venda considera apenas produtos ativos, com controle de estoque, preço maior que zero e venda direta. Reservas de comandas são descontadas. Insumos sem preço e preparos por ficha técnica não geram receita projetada aqui, evitando contar ingredientes e porções como vendas independentes.</p><p>O lucro e a margem usam exatamente os mesmos produtos e quantidades disponíveis. Custos ausentes ou médias afetadas por entradas sem custo no ciclo atual ficam fora dessa base. Atualizar uma compra não transforma o valor em lucro realizado.</p><p>Estimativa aos preços atuais, antes de descontos, perdas futuras, taxas, impostos, mão de obra e demais despesas. Fonte: catálogo e movimentos do estoque do Long Beach OS. Atualização automática a cada 30 segundos enquanto a página está aberta.</p></Disclosure>}
    </>}
  </section>
}
