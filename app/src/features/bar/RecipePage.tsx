import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EditorPanel, useEditorQuery, useUnsavedChanges } from '../../components/managementUi'
import { useAuth } from '../auth/authContext'
import { dateTime, useBarCommand, useBarData, type PageResult } from '../attendance/api'
import { ApiError, apiFetch } from '../../lib/http'
import { Breadcrumb, Empty, Field, Group, Heading, NoAccess, Notes, SaveRow, Status, quantity, useFilters } from '../../pages/arenaUi'

export type RecipeVersion = {
  id: string; productId: string; productName: string; version: number; yieldQuantity: number; reason: string; actorId: string; createdAtUtc: string
  ingredients: { id: string; productId: string; name: string; quantity: number; unit: 'Sale' | 'Purchase'; conversionFactor: number; stockUnit: string; stockQuantity: number }[]
}
type RecipeProduct = { id: string; name: string; shortName: string; saleUnit: string; prepared: boolean; active: boolean; controlsStock: boolean }
type ManagedProduct = { product: RecipeProduct; purchaseUnit: string; conversionFactor: number }
type RecipeInput = { operationId: string; productId: string; yieldQuantity: number; reason: string; ingredients: { productId: string; quantity: number; unit: 'Sale' | 'Purchase' }[] }
type IngredientRow = RecipeInput['ingredients'][number] & { key: string }

function RecipeDetails({ recipe, current }: { recipe: RecipeVersion; current?: boolean }) {
  return <section className="operation-card arena-recipe-detail">
    <div className="arena-section-heading"><div><Status>{current ? 'Receita atual' : 'Versão registrada'}</Status><h2>Versão {recipe.version} · {recipe.productName}</h2></div><p>{dateTime(recipe.createdAtUtc)}</p></div>
    <p><strong>Rendimento: {quantity(recipe.yieldQuantity)}</strong> na unidade de venda do produto preparado.</p>
    <ul className="arena-ingredient-list">{recipe.ingredients.map(item => <li key={item.id}><strong>{item.name}</strong><span>{quantity(item.quantity)} {item.unit === 'Purchase' ? 'na unidade de compra' : item.stockUnit} → {quantity(item.stockQuantity)} {item.stockUnit} de estoque por receita</span></li>)}</ul>
    <p className="arena-hint">A entrega de 1 unidade utiliza 1/{quantity(recipe.yieldQuantity)} desta receita. O pagamento não repete a saída do estoque.</p>
    <p className="detail-notes"><strong>Motivo da versão:</strong> {recipe.reason}</p>
  </section>
}

function RecipeEditor({ product, products, previous, onCancel, onSaved, onLockedChange }: { product: ManagedProduct; products: ManagedProduct[]; previous?: RecipeVersion; onCancel: () => void; onSaved: (recipe: RecipeVersion) => void; onLockedChange: (locked: boolean) => void }) {
  const action = useBarCommand(); const {markSaved}=useUnsavedChanges(); const operationId = useRef(crypto.randomUUID()); const retry = useRef<RecipeInput | null>(null)
  const [uncertain, setUncertain] = useState(false); const [yieldQuantity, setYield] = useState(previous?.yieldQuantity ?? 1); const [reason, setReason] = useState('')
  const [rows, setRows] = useState<IngredientRow[]>(() => previous?.ingredients.map(item => ({ key: crypto.randomUUID(), productId: item.productId, quantity: item.quantity, unit: item.unit })) ?? [{ key: crypto.randomUUID(), productId: '', quantity: 1, unit: 'Sale' }])
  const ingredients = products.filter(item => item.product.active && item.product.controlsStock && !item.product.prepared && item.product.id !== product.product.id)
  const update = (key: string, changes: Partial<IngredientRow>) => setRows(current => current.map(row => row.key === key ? { ...row, ...changes } : row))
  const disabled = action.busy || uncertain

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!retry.current) {
      if (!Number.isFinite(yieldQuantity) || yieldQuantity <= 0 || !reason.trim() || !rows.length || rows.some(row => !ingredients.some(item => item.product.id === row.productId) || !Number.isFinite(row.quantity) || row.quantity <= 0) || new Set(rows.map(row => row.productId)).size !== rows.length) {
        action.setError('Informe um rendimento maior que zero, o motivo e ingredientes distintos com quantidades maiores que zero.'); return
      }
      retry.current = { operationId: operationId.current, productId: product.product.id, yieldQuantity, reason: reason.trim(), ingredients: rows.map(({ productId, quantity: amount, unit }) => ({ productId, quantity: amount, unit })) }
    }
    onLockedChange(true)
    const result = await action.run(() => apiFetch<RecipeVersion>('/api/v1/bar/recipes', { method: 'POST', body: JSON.stringify(retry.current) }))
    if (result.ok) { markSaved(); onLockedChange(false); onSaved(result.value); return }
    if (!result.error) return
    const rejected = result.error instanceof ApiError && [400, 403, 409, 422].includes(result.error.status)
    setUncertain(!rejected)
    if (rejected) { retry.current = null; operationId.current = crypto.randomUUID(); onLockedChange(false) }
  }

  return <form className="operation-card operation-form" onSubmit={submit}>
    <h2>{previous ? 'Criar nova versão' : 'Cadastrar primeira receita'}</h2>
    {action.error && <p className="arena-message arena-error" role="alert">{action.error}</p>}
    {uncertain && <p className="arena-message" role="status">O registro ainda não foi confirmado. Repita este envio com os mesmos dados antes de criar outra versão.</p>}
    <fieldset className="arena-input-lock" disabled={disabled}>
      <Group title="1. Rendimento"><Field label={`Rendimento (${product.product.saleUnit})`} type="number" min={0.001} required value={yieldQuantity} onChange={value => setYield(Number(value))} /><Notes label="Motivo desta versão" value={reason} onChange={setReason} /></Group>
      <Group title="2. Ingredientes para esse rendimento">
        <div className="operation-field-wide arena-recipe-rows">{rows.map((row, index) => {
          const ingredient = ingredients.find(item => item.product.id === row.productId)
          return <div className="arena-recipe-row" key={row.key}>
            <Field label={`Ingrediente ${index + 1}`} required value={row.productId} onChange={productId => update(row.key, { productId, unit: 'Sale' })} options={[{ value: '', label: 'Escolha o ingrediente' }, ...ingredients.map(item => ({ value: item.product.id, label: item.product.name }))]} />
            <Field label={`Quantidade do ingrediente ${index + 1}`} required type="number" min={0.001} value={row.quantity} onChange={value => update(row.key, { quantity: Number(value) })} />
            <Field label={`Unidade do ingrediente ${index + 1}`} value={row.unit} onChange={unit => update(row.key, { unit: unit as 'Sale' | 'Purchase' })} options={[{ value: 'Sale', label: `Estoque · ${ingredient?.product.saleUnit ?? 'unidade base'}` }, { value: 'Purchase', label: `Compra · ${ingredient?.purchaseUnit ?? 'unidade de compra'}` }]} />
            <button className="text-button" type="button" disabled={rows.length === 1} aria-label={`Remover ingrediente ${index + 1}`} onClick={() => setRows(current => current.filter(item => item.key !== row.key))}>Remover</button>
            {ingredient && <p className="arena-hint">Será registrado: {quantity(row.quantity * (row.unit === 'Purchase' ? ingredient.conversionFactor : 1))} {ingredient.product.saleUnit} de estoque por receita.</p>}
          </div>
        })}<button className="secondary-link" type="button" onClick={() => setRows(current => [...current, { key: crypto.randomUUID(), productId: '', quantity: 1, unit: 'Sale' }])}>+ Adicionar ingrediente</button></div>
      </Group>
    </fieldset>
    <p className="arena-hint">A receita é guardada como uma versão. Pedidos já confirmados conservam a versão e a conversão originais, mesmo após esta alteração.</p>
    <SaveRow label={uncertain ? 'Repetir registro da versão' : 'Salvar versão da receita'} busy={action.busy} disabled={!ingredients.length} onCancel={uncertain ? undefined : onCancel} />
    {!ingredients.length && <p className="arena-message">Cadastre um ingrediente ativo com controle de estoque para compor a receita. <Link to="/bar/produtos">Ver produtos →</Link></p>}
  </form>
}

export function BarRecipesPage() {
  const { user } = useAuth(); const { productId } = useParams(); const filters = useFilters(); const navigate = useNavigate()
  const allowed = Boolean(user?.roles.includes('Owner')||user?.permissions.includes('bar:catalog:write'))
  const products = useBarData<ManagedProduct[]>('/products', allowed)
  const rawPage = Number(filters.params.get('page') ?? 1); const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1
  const versionId = filters.params.get('version') ?? ''
  const first = useBarData<PageResult<RecipeVersion>>(`/recipes?productId=${encodeURIComponent(productId ?? '')}&page=1&pageSize=20`, allowed && Boolean(productId))
  const history = useBarData<PageResult<RecipeVersion>>(`/recipes?productId=${encodeURIComponent(productId ?? '')}&page=${page}&pageSize=20`, allowed && Boolean(productId))
  const version = useBarData<RecipeVersion>(`/recipes/${encodeURIComponent(versionId)}`, allowed && Boolean(versionId))
  const [editing, setEditing] = useEditorQuery(false,productId); const [saved, setSaved] = useState<RecipeVersion | null>(null); const [draftLocked, setDraftLocked] = useState(false)
  const product = products.data?.find(item => item.product.id === productId)
  const current = first.data?.items[0]
  const selected = versionId ? version.data?.productId === productId ? version.data : undefined : current
  if (!allowed) return <NoAccess />
  const choose = (id: string) => { setEditing(false); setSaved(null); navigate(filters.href(id ? `/bar/receitas/${id}` : '/bar/receitas', { page: '', version: '' })) }
  return <main className="operation-page arena-page">
    <Breadcrumb to="/bar/produtos" label="Produtos do bar" />
    <Heading eyebrow="Gestão do bar" title="Fichas técnicas" description="Defina ingredientes e rendimento. A equipe de atendimento vende o produto; a entrega utiliza a receita confirmada no pedido." />
    {products.isLoading && <p role="status" className="arena-message">Carregando produtos…</p>}
    {products.error && <p role="alert" className="arena-message arena-error">{products.error.message} <button className="text-button" onClick={() => void products.refetch()}>Tentar novamente</button></p>}
    <div className="arena-toolbar"><Field label="Produto preparado" disabled={draftLocked} value={productId ?? ''} onChange={choose} options={[{ value: '', label: 'Escolha um produto preparado' }, ...(products.data?.filter(item => item.product.prepared).map(item => ({ value: item.product.id, label: `${item.product.name}${item.product.active ? '' : ' · inativo'}` })) ?? [])]} /></div>
    {!productId ? <Empty action={<Link className="secondary-link" to="/bar/produtos">Cadastrar ou editar produtos →</Link>}>Escolha um produto preparado para ver sua receita e o histórico de versões.</Empty> : product && !product.product.prepared ? <Empty>Este produto não está marcado como preparado. Configure o produto antes de cadastrar a receita.</Empty> : product ? <>
      {saved?.productId === productId && <p className="arena-message" role="status">Versão {saved.version} registrada. Os pedidos anteriores mantêm a versão original.</p>}
      {first.isLoading && <p className="arena-message" role="status">Carregando receitas…</p>}
      {first.error && <p className="arena-message arena-error" role="alert">{first.error.message} <button className="text-button" onClick={() => void first.refetch()}>Consultar receitas novamente</button></p>}
      {version.error && versionId && <p className="arena-message arena-error" role="alert">Não foi possível consultar esta versão.</p>}
      {version.data && versionId && version.data.productId !== productId && <p className="arena-message arena-error" role="alert">Esta versão pertence a outro produto. Escolha uma versão no histórico abaixo.</p>}
      {editing ? <EditorPanel title="Editar ficha técnica" busy={draftLocked} onClose={()=>setEditing(false)}><RecipeEditor key={productId} product={product} products={products.data ?? []} previous={current} onLockedChange={setDraftLocked} onCancel={() => setEditing(false)} onSaved={recipe => { setSaved(recipe); setEditing(false); navigate(filters.href(`/bar/receitas/${productId}`,{version:recipe.id})) }} /></EditorPanel> : !first.isLoading && !first.isError ? <div className="arena-actions"><button className="primary-link" disabled={!product.product.active} onClick={() => setEditing(true)}>{current ? 'Criar nova versão da receita' : 'Cadastrar primeira receita'}</button>{versionId && <Link className="secondary-link" to={filters.href(`/bar/receitas/${productId}`, { version: '', page: '' })}>Ver receita atual →</Link>}</div> : null}
      {!editing && selected && <RecipeDetails recipe={selected} current={!first.isError && selected.id === current?.id} />}
      {!editing && !current && !first.isLoading && !first.isError && <Empty>Este preparado ainda não tem receita. Até cadastrar uma receita, a entrega usa o próprio estoque conforme a configuração do produto.</Empty>}
      {!product.product.active && <p className="arena-hint">Produto inativo. Ative-o em Produtos para cadastrar uma nova versão.</p>}
      <section className="operation-card"><h2>Histórico de versões</h2><p className="arena-hint">As versões anteriores permanecem disponíveis para conferir consumos já confirmados.</p>
        {history.error && <p className="arena-message arena-error" role="alert">O histórico não pôde ser atualizado.</p>}
        <div className="arena-slots">{history.data?.items.map(recipe => <Link className="arena-slot" key={recipe.id} to={filters.href(`/bar/receitas/${productId}`, { version: recipe.id })} aria-label={`Versão ${recipe.version} · ${recipe.reason} · Ver composição`}><strong>Versão {recipe.version}</strong><span><strong>{recipe.reason}</strong><small>{dateTime(recipe.createdAtUtc)} · {recipe.ingredients.length} ingredientes · rendimento {quantity(recipe.yieldQuantity)} {product.product.saleUnit}</small></span><span>Ver composição →</span></Link>)}</div>
        {history.data && history.data.total > history.data.pageSize && <nav className="arena-pagination" aria-label="Páginas das receitas"><button className="secondary-link" disabled={page <= 1} onClick={() => filters.set('page', String(page - 1))}>Anterior</button><span>{page} de {Math.ceil(history.data.total / history.data.pageSize)}</span><button className="secondary-link" disabled={page * history.data.pageSize >= history.data.total} onClick={() => filters.set('page', String(page + 1))}>Próxima</button></nav>}
      </section>
    </> : !products.isLoading && !products.isError ? <Empty>Produto não encontrado. Escolha um preparado na lista acima.</Empty> : null}
  </main>
}
