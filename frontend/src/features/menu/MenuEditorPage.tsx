import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadMenu, loadMenuCatalog, publishMenu, saveMenu } from './menuApi'
import { createStarterMenu } from './menuTemplate'
import { resolveMenuPreview, type MenuAdminState, type MenuCatalogProduct, type MenuDocument } from './menuTypes'
import { MenuPreview } from './MenuSlide'

const move = <T,>(items: T[], index: number, direction: number): T[] => {
  const next = [...items], target = index + direction
  if (target < 0 || target >= items.length) return next
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
export function MenuEditorPage() {
  const [state, setState] = useState<MenuAdminState | null>(null)
  const [draft, setDraft] = useState<MenuDocument>({ title: 'CARDÁPIO', pages: [] })
  const [products, setProducts] = useState<MenuCatalogProduct[]>([])
  const [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState(''), [preview, setPreview] = useState(false)
  const accept = (next: MenuAdminState) => { setState(next); setDraft(next.draft); setDirty(false) }
  const reload = async () => {
    setBusy(true)
    try { const [next, catalog] = await Promise.all([loadMenu(), loadMenuCatalog()]); accept(next); setProducts(catalog); setMessage('') }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Falha ao carregar.') }
    finally { setBusy(false) }
  }
  useEffect(() => { void reload() }, [])
  const edit = (next: MenuDocument) => { setDraft(next); setDirty(true) }
  const errors = resolveMenuPreview(draft, products).issues
  async function persist(publish: boolean) {
    if (!state) return
    setBusy(true); setMessage('')
    try {
      accept(publish ? await publishMenu(state.version) : await saveMenu(state.version, draft))
      setMessage(publish ? 'Cardápio publicado.' : 'Rascunho salvo. A publicação permanece estável.')
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Não foi possível salvar.') }
    finally { setBusy(false) }
  }
  return <main className="page"><h1>Cardápio digital</h1>
    <p>Os preços vêm do cadastro oficial e também afetam as vendas. Alterações do catálogo entram na apresentação somente após nova publicação.</p>
    <p><Link to="/bar/produtos">Abrir cadastro e preços</Link> · <Link to="/cardapio/apresentacao" target="_blank">Abrir apresentação</Link></p>
    <p role="status">{message}</p>
    {!state ? <button disabled={busy} onClick={() => void reload()}>Carregar novamente</button> : <>
      <p>Versão de edição: {state.version} · {state.published ? `Publicação: ${state.published.version}` : 'Ainda sem publicação'}{dirty ? ' · Alterações não salvas' : ''}</p>
      <fieldset disabled={busy}><legend>Edição</legend>
        <label>Título <input value={draft.title} maxLength={160} onChange={e => edit({ ...draft, title: e.target.value })} /></label>
        <button onClick={() => { if (!draft.pages.length || window.confirm('Substituir o rascunho pelo modelo aprovado?')) edit(createStarterMenu(products)) }}>Carregar modelo aprovado</button>
        <button onClick={() => edit({ ...draft, pages: [...draft.pages, { id: crypto.randomUUID(), title: 'Nova página', durationSeconds: 10, visible: true, items: [] }] })}>Adicionar página</button>
        {draft.pages.map((page, pi) => {
          const update = (next: typeof page) => edit({ ...draft, pages: draft.pages.map((p, i) => i === pi ? next : p) })
          return <fieldset key={page.id}><legend>Página {pi + 1}</legend>
            <label>Nome da página <input value={page.title} maxLength={160} onChange={e => update({ ...page, title: e.target.value })} /></label>
            <label>Segundos <input type="number" min={5} max={120} value={page.durationSeconds} onChange={e => update({ ...page, durationSeconds: Number(e.target.value) })} /></label>
            <label><input type="checkbox" checked={page.visible} onChange={e => update({ ...page, visible: e.target.checked })} />Página visível</label>
            {[-1, 1].map(d => <button key={d} disabled={d < 0 ? pi === 0 : pi === draft.pages.length - 1} onClick={() => edit({ ...draft, pages: move(draft.pages, pi, d) })}>{d < 0 ? 'Subir página' : 'Descer página'}</button>)}
            {page.items.map((item, ii) => {
              const change = (next: typeof item) => update({ ...page, items: page.items.map((v, i) => i === ii ? next : v) })
              return <fieldset key={item.id}><legend>Item {ii + 1}</legend>
                <label>Nome <input value={item.name} maxLength={160} onChange={e => change({ ...item, name: e.target.value })} /></label>
                <label>Descrição opcional <input value={item.description} maxLength={1000} onChange={e => change({ ...item, description: e.target.value })} /></label>
                <label><input type="checkbox" checked={item.visible} onChange={e => change({ ...item, visible: e.target.checked })} />Item visível</label>
                <label>Produtos vinculados (seleção múltipla)<select multiple size={5} value={item.productIds} onChange={e => change({ ...item, productIds: Array.from(e.target.selectedOptions, o => o.value) })}>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} · {p.salePrice > 0 ? p.salePrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Preço pendente'}{p.active ? '' : ' · Inativo'}</option>)}
                  {item.productIds.filter(id => !products.some(p => p.id === id)).map(id => <option key={id} value={id}>Produto ausente: {id}</option>)}
                </select></label>
                <p>{item.productIds.map(id => { const p = products.find(v => v.id === id); return p ? `${p.name}: ${p.salePrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : 'Produto ausente' }).join(' · ') || 'Vínculo pendente'}</p>
                {[-1, 1].map(d => <button key={d} disabled={d < 0 ? ii === 0 : ii === page.items.length - 1} onClick={() => update({ ...page, items: move(page.items, ii, d) })}>{d < 0 ? 'Subir item' : 'Descer item'}</button>)}
              </fieldset>
            })}
            <button onClick={() => update({ ...page, items: [...page.items, { id: crypto.randomUUID(), name: 'Novo item', description: '', visible: true, productIds: [] }] })}>Adicionar item</button>
          </fieldset>
        })}
      </fieldset>
      {errors.length > 0 && <section aria-label="Pendências de publicação"><h2>Pendências</h2><ul>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul></section>}
      <button disabled={busy} onClick={() => setPreview(v => !v)}>Conferir prévia</button>
      <button disabled={busy || !dirty} onClick={() => void persist(false)}>Salvar rascunho</button>
      <button disabled={busy || dirty || errors.length > 0} onClick={() => void persist(true)}>Publicar versão salva</button>
      <button disabled={busy} onClick={() => { if (!dirty || window.confirm('Descartar alterações locais e recarregar?')) void reload() }}>Recarregar cardápio e catálogo</button>
      {preview && <MenuPreview document={draft} products={products} />}
    </>}
  </main>
}
