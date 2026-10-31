import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadMenu, loadMenuCatalog, publishMenu, saveMenu } from './menuApi'
import { createStarterMenu } from './menuTemplate'
import { resolveMenuItem, resolveMenuPreview, type MenuAdminState, type MenuCatalogProduct, type MenuDocument } from './menuTypes'
import { MenuPreview } from './MenuSlide'
import './menu-editor.css'

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
  const catalog = new Map(products.map(product => [product.id, product]))
  async function persist(publish: boolean) {
    if (!state) return
    setBusy(true); setMessage('')
    try {
      accept(publish ? await publishMenu(state.version) : await saveMenu(state.version, draft))
      setMessage(publish ? 'Cardápio publicado.' : 'Rascunho salvo. A publicação permanece estável.')
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Não foi possível salvar.') }
    finally { setBusy(false) }
  }
  return <main className="operation-page arena-page menu-editor menu-editor-clean"><header className="page-heading"><h1>Cardápio digital</h1><nav className="menu-editor-links" aria-label="Acessos do cardápio"><Link to="/bar/produtos">Cadastro e preços</Link><Link to="/cardapio/apresentacao" target="_blank">Abrir apresentação</Link></nav></header>
    <p className="arena-hint">Preços do cadastro também valem nas vendas. Alterações só aparecem no cardápio após publicar.</p>
    {message && <p role="status">{message}</p>}
    {!state ? <button disabled={busy} onClick={() => void reload()}>Carregar novamente</button> : <>
      <p>Versão de edição: {state.version} · {state.published ? `Publicação: ${state.published.version}` : 'Ainda sem publicação'}{dirty ? ' · Alterações não salvas' : ''}</p>
      {errors.length > 0 && <section aria-label="Pendências de publicação"><h2>Pendências</h2><ul>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul></section>}
      <div className="menu-editor-actions"><button disabled={busy || !dirty} onClick={() => void persist(false)}>Salvar rascunho</button><button className="primary-button" disabled={busy || dirty || errors.length > 0} onClick={() => void persist(true)}>Publicar versão salva</button><button disabled={busy} onClick={() => setPreview(v => !v)} aria-expanded={preview}>Conferir prévia</button></div>
      {preview && <MenuPreview document={draft} products={products} />}
      <fieldset disabled={busy} onInvalidCapture={event => {
        let parent = event.target as HTMLElement | null
        while (parent && parent !== event.currentTarget) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement }
        requestAnimationFrame(() => (event.target as HTMLElement).focus())
      }}><legend>Edição</legend>
        <label>Título <input value={draft.title} maxLength={160} onChange={e => edit({ ...draft, title: e.target.value })} /></label>
        <details className="menu-editor-options"><summary>Opções do rascunho</summary><button onClick={() => { if (!draft.pages.length || window.confirm('Substituir o rascunho pelo modelo aprovado?')) edit(createStarterMenu(products)) }}>Carregar modelo aprovado</button><button disabled={busy} onClick={() => { if (!dirty || window.confirm('Descartar alterações locais e recarregar?')) void reload() }}>Recarregar cardápio e catálogo</button></details>
        <button onClick={() => edit({ ...draft, pages: [...draft.pages, { id: crypto.randomUUID(), title: 'Nova página', durationSeconds: 10, visible: true, items: [] }] })}>Adicionar página</button>
        {draft.pages.map((page, pi) => {
          const update = (next: typeof page) => edit({ ...draft, pages: draft.pages.map((p, i) => i === pi ? next : p) })
          const issues = page.visible ? page.items.filter(item => item.visible).flatMap(item => { const issue = resolveMenuItem(item, catalog).issue; return issue ? [`${item.name}: ${issue}`] : [] }) : []
          return <details className="menu-editor-page" key={page.id} open={pi === 0}><summary><strong>{page.title || `Página ${pi + 1}`}</strong><span>{page.items.length} itens · {page.durationSeconds} s · {page.visible ? 'Visível' : 'Oculta'}</span>{issues.length > 0 && <span className="menu-editor-issue">{issues.join(' · ')}</span>}</summary><fieldset><legend>Página {pi + 1}</legend>
            <label>Nome da página <input value={page.title} maxLength={160} onChange={e => update({ ...page, title: e.target.value })} /></label>
            <label>Segundos <input type="number" min={5} max={120} value={page.durationSeconds} onChange={e => update({ ...page, durationSeconds: Number(e.target.value) })} /></label>
            <label><input type="checkbox" checked={page.visible} onChange={e => update({ ...page, visible: e.target.checked })} />Página visível</label>
            {[-1, 1].map(d => <button key={d} disabled={d < 0 ? pi === 0 : pi === draft.pages.length - 1} onClick={() => edit({ ...draft, pages: move(draft.pages, pi, d) })}>{d < 0 ? 'Subir página' : 'Descer página'}</button>)}
            {page.items.map((item, ii) => {
              const change = (next: typeof item) => update({ ...page, items: page.items.map((v, i) => i === ii ? next : v) })
              const issue = page.visible && item.visible ? resolveMenuItem(item, catalog).issue : undefined
              return <details className="menu-editor-item" key={item.id} open={ii === 0}><summary><strong>{item.name || `Item ${ii + 1}`}{!item.visible && ' · Oculto'}</strong><span>{item.productIds.map(id => { const p = products.find(v => v.id === id); return p ? `${p.name}: ${p.salePrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : 'Produto ausente' }).join(' · ') || 'Vínculo pendente'}</span>{issue && <span className="menu-editor-issue">{issue}</span>}</summary><fieldset><legend>Item {ii + 1}</legend>
                <label>Nome <input value={item.name} maxLength={160} onChange={e => change({ ...item, name: e.target.value })} /></label>
                <label>Descrição opcional <input value={item.description} maxLength={1000} onChange={e => change({ ...item, description: e.target.value })} /></label>
                <label><input type="checkbox" checked={item.visible} onChange={e => change({ ...item, visible: e.target.checked })} />Item visível</label>
                <label>Produtos vinculados (seleção múltipla)<select multiple size={5} value={item.productIds} onChange={e => change({ ...item, productIds: Array.from(e.target.selectedOptions, o => o.value) })}>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} · {p.salePrice > 0 ? p.salePrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Preço pendente'}{p.active ? '' : ' · Inativo'}</option>)}
                  {item.productIds.filter(id => !products.some(p => p.id === id)).map(id => <option key={id} value={id}>Produto ausente: {id}</option>)}
                </select></label>
                {[-1, 1].map(d => <button key={d} disabled={d < 0 ? ii === 0 : ii === page.items.length - 1} onClick={() => update({ ...page, items: move(page.items, ii, d) })}>{d < 0 ? 'Subir item' : 'Descer item'}</button>)}
              </fieldset></details>
            })}
            <button onClick={() => update({ ...page, items: [...page.items, { id: crypto.randomUUID(), name: 'Novo item', description: '', visible: true, productIds: [] }] })}>Adicionar item</button>
          </fieldset></details>
        })}
      </fieldset>
    </>}
  </main>
}
