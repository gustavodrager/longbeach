import { useEffect, useRef, useState, type FormEvent } from 'react'
import { EditorPanel, useUnsavedChanges } from '../../components/managementUi'
import { Field, SaveRow } from '../../pages/arenaUi'
import { ApiError } from '../../lib/http'
import { saveStaffType, staffError, type StaffAccessType, type StaffCatalog } from './api'

const actionNotes: Record<string, string> = {
  'bar.supervise': 'Inclui descontos, cortesias, correções de itens, reabertura e consulta de outros caixas e aprovações de estoque.',
  'bar.refund': 'Permite estornar recebimentos do bar.',
  'stock.operate': 'Inclui edição do catálogo, consulta de custos, compras e movimentações administrativas de estoque.',
  'finance.operate': 'Permite lançamentos, pagamentos e estornos do financeiro geral.',
  'customers.merge': 'Permite unificar fichas de clientes após conferir a identidade e os vínculos.',
  'materials.adjust': 'Permite corrigir saldos e aprovar ajustes de materiais.',
  'stock.fiscal': 'Permite importar e conferir notas fiscais de compras.',
}
const operations: Record<string, string> = {
  'bar.sell': 'Inclui registrar vendas.',
  'bar.orders': 'Inclui atender e encaminhar pedidos.',
  'bar.receive': 'Inclui receber pagamentos do bar.',
  'bar.cash': 'Inclui abrir, operar e fechar o próprio caixa.',
}

export function AccessTypesPanel({ types, catalog, onChanged, onClose }: { types: StaffAccessType[]; catalog: StaffCatalog; onChanged: () => Promise<unknown>; onClose: () => void }) {
  const [selected, setSelected] = useState(types[0]?.id ?? '')
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const type = types.find(item => item.id === selected)
  return <AccessTypeEditor key={`${type?.id}:${type?.version}`} types={types} type={type} catalog={catalog} select={setSelected} onChanged={onChanged} onClose={() => { if (mounted.current) onClose() }} />
}
function AccessTypeEditor({ types, type, catalog, select, onChanged, onClose }: { types: StaffAccessType[]; type?: StaffAccessType; catalog: StaffCatalog; select: (id: string) => void; onChanged: () => Promise<unknown>; onClose: () => void }) {
  const [menus, setMenus] = useState(type?.menus ?? [])
  const [actions, setActions] = useState(type?.actions ?? [])
  const [name, setName] = useState(type?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const mounted = useRef(true)
  const locked = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const { markSaved, dirty } = useUnsavedChanges()
  const allowedMenus = catalog.menus.filter(menu => type && menu.typeIds.includes(type.id))
  const areas = [...new Set(allowedMenus.map(menu => menu.area))]
  const allowedActions = catalog.actions.filter(action => type && action.typeIds.includes(type.id))
  const actionName = (id: string) => { const action = allowedActions.find(item => item.id === id); const menu = allowedMenus.find(item => item.id === action?.menuId); return action?.label === 'Alterar' && menu ? `Alterar ${menu.label.toLocaleLowerCase('pt-BR')}` : action?.label ?? id }
  const toggleAction = (id: string, checked: boolean) => {
    setActions(current => {
      if (checked) return [...current, id]
      let next = current.filter(value => value !== id)
      while (next.some(value => allowedActions.find(action => action.id === value)?.requiresActions?.some(required => !next.includes(required)))) next = next.filter(value => !allowedActions.find(action => action.id === value)?.requiresActions?.some(required => !next.includes(required)))
      return next
    })
    setConfirmed(false)
  }
  const toggleMenu = (id: string, checked: boolean) => {
    setMenus(current => checked ? [...current, id] : current.filter(value => value !== id))
    if (!checked) setActions(current => current.filter(actionId => !allowedActions.some(action => action.id === actionId && action.menuId === id)))
    else if (operations[id]) setActions(current => current.includes(id) ? current : [...current, id])
    setConfirmed(false)
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!type || locked.current || uncertain || !confirmed || !menus.length) return
    locked.current = true; setBusy(true); setError('')
    try { await saveStaffType(type.id, { name: name.trim(), menus, actions: actions.filter(id => allowedActions.some(action => action.id === id && menus.includes(action.menuId))), version: type.version }); if (mounted.current) { markSaved(); await onChanged(); onClose() } }
    catch (cause) { if (mounted.current) { setError(staffError(cause)); setUncertain(!(cause instanceof ApiError) || cause.status === 409 || cause.status === 0 || cause.status >= 500) } }
    finally { locked.current = false; if (mounted.current) setBusy(false) }
  }
  async function refresh() { setBusy(true); try { await onChanged(); if (mounted.current) { markSaved(); setUncertain(false); setError('') } } catch (cause) { if (mounted.current) setError(staffError(cause)) } finally { if (mounted.current) setBusy(false) } }
  return <EditorPanel title="Tipos de acesso" busy={busy} onClose={onClose} hasUnsavedChanges={dirty} className="staff-access-types"><form className="operation-form" onSubmit={submit}>
    <Field label="Tipo de acesso" value={type?.id ?? ''} options={types.map(item => ({ value: item.id, label: item.name }))} disabled={busy || uncertain} onChange={id => { if (!dirty || window.confirm('Descartar as alterações deste tipo?')) { markSaved(); select(id) } }} />
    <Field label="Nome do tipo" value={name} onChange={setName} required disabled={busy || uncertain} />
    {areas.map(area => <fieldset className="staff-access-area" key={area}><legend>{area}</legend>{allowedMenus.filter(menu => menu.area === area).map(menu => <div className="staff-access-menu" key={menu.id}>
      <label className="staff-access-check"><input type="checkbox" checked={menus.includes(menu.id)} disabled={busy || uncertain} onChange={event => toggleMenu(menu.id, event.target.checked)} />{menu.label}</label>
      {menus.includes(menu.id) && operations[menu.id] && <p className="arena-hint staff-access-action">{operations[menu.id]}</p>}
      {menus.includes(menu.id) && allowedActions.filter(action => action.menuId === menu.id && !(operations[menu.id] && action.id === menu.id)).map(action => <div className="staff-access-action" key={action.id}><label className="staff-access-check"><input type="checkbox" checked={actions.includes(action.id)} disabled={busy || uncertain || Boolean(action.requiresActions?.some(id => !actions.includes(id)))} onChange={event => toggleAction(action.id, event.target.checked)} />{action.id === 'bar.tabs' ? 'Operar comandas' : actionName(action.id)}</label>{actionNotes[action.id] && <p className="arena-hint">{actionNotes[action.id]}</p>}{action.requiresActions?.some(id => !actions.includes(id)) && <p className="arena-hint">Ative {action.requiresActions.map(actionName).join(' e ')} para liberar esta ação.</p>}</div>)}
    </div>)}</fieldset>)}
    {!menus.length && <p role="alert">Selecione pelo menos uma área para este tipo.</p>}
    <p role="status">Esta alteração afeta {type?.memberCount ?? 0} {type?.memberCount === 1 ? 'pessoa' : 'pessoas'}. As sessões dessas contas serão encerradas.</p>
    <label className="staff-access-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy || uncertain} required />Conferi os acessos e as pessoas afetadas.</label>
    {error && <p role="alert" className="arena-message arena-error">{error}</p>}
    {uncertain && <><p className="arena-hint">Atualize os tipos para conferir o que foi salvo antes de enviar novamente.</p><button type="button" className="secondary-link" disabled={busy} onClick={() => void refresh()}>Atualizar tipos</button></>}
    <SaveRow label="Salvar tipo" busy={busy} disabled={!confirmed || !menus.length || uncertain} onCancel={onClose} />
  </form></EditorPanel>
}
