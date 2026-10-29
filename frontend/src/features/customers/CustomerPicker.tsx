import { useEffect, useId, useRef, useState } from 'react'
import { useAuth } from '../auth/authContext'
import { useConfirmationGate } from '../attendance/Core'
import { readCustomerCreation, rememberCustomerCreation } from './confirmation'
import { canUseCustomerScope, createCustomer, customerLookup, customerPhone, customerReference, useCustomerCommand, useCustomerLookup, validCustomerPhone, type CustomerCreate, type CustomerLookup, type CustomerScope, type CustomerSelection } from './api'
import './customers.css'

export type CustomerPickerProps = {
  scope: CustomerScope; value: CustomerSelection | null; onChange: (value: CustomerLookup | null) => void
  disabled?: boolean; required?: boolean; label?: string; contextKey?: string
}

/** Inline creation deliberately has no nested form and never grants portal access. */
export function CustomerPicker(props: CustomerPickerProps) {
  const { user } = useAuth()
  const session = user ? `${user.id}:${[...user.roles].sort().join(',')}:${[...user.permissions].sort().join(',')}` : 'signed-out'
  return <CustomerPickerContent key={`${session}:${props.scope}:${props.contextKey ?? 'default'}`} {...props} />
}
function CustomerPickerContent({ scope, value, onChange, disabled = false, required = false, label = 'Cliente', contextKey = 'default' }: CustomerPickerProps) {
  const { user } = useAuth()
  const [saved, setSaved] = useConfirmationGate(`customer-create-v1:${user?.id}:${scope}:${contextKey}`)
  const pending = readCustomerCreation(saved)
  const invalidPending = Boolean(saved && !pending)
  const restored = useRef(Boolean(saved))
  const [recovered, setRecovered] = useState<CustomerLookup | null>(null)
  const root = useRef<HTMLFieldSetElement>(null)
  const pendingRef = useRef(Boolean(saved)); pendingRef.current = Boolean(saved)
  const [search, setSearch] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [creating, setCreating] = useState(Boolean(saved))
  const [name, setName] = useState(pending?.name ?? '')
  const [phone, setPhone] = useState(pending?.phone ?? '')
  const [validation, setValidation] = useState('')
  const command = useCustomerCommand()
  const input = useRef<HTMLInputElement>(null)
  const id = useId()
  const scopeRef = useRef(scope); scopeRef.current = scope
  const attempt = useRef<{ fingerprint: string; input: CustomerCreate } | null>(null)
  const readable = canUseCustomerScope(user, scope)
  const writable = canUseCustomerScope(user, scope, true)
  const locked = disabled || command.busy || !readable
  useEffect(() => {
    setSubmitted('')
    if (disabled || !readable || value || creating) return
    const timer = window.setTimeout(() => setSubmitted(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search, disabled, readable, value?.id, creating, scope])
  useEffect(() => { input.current?.setCustomValidity(required && !value ? 'Selecione um cliente cadastrado.' : '') }, [required, value?.id, search])
  useEffect(() => {
    const form = root.current?.closest('form')
    const stop = (event: Event) => { if (required && pendingRef.current) { event.preventDefault(); event.stopPropagation(); setValidation('Confira a criação pendente antes de salvar este atendimento.') } }
    form?.addEventListener('submit', stop, true)
    return () => form?.removeEventListener('submit', stop, true)
  }, [required])
  const results = useCustomerLookup(scope, submitted, !locked && !value && !creating && submitted === search.trim())
  const shown = submitted.length >= 3 && submitted === search.trim() && !value && !creating && readable && !disabled

  async function save() {
    if (locked || !writable || invalidPending) return
    if (!pending && (!name.trim() || !validCustomerPhone(phone))) { setValidation('Informe o nome e um telefone com DDD ou código do país, com 10 a 15 dígitos.'); return }
    setValidation('')
    const fingerprint = JSON.stringify([scope, name.trim(), customerPhone(phone)])
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, input: { operationId: crypto.randomUUID(), name: name.trim(), phone: customerPhone(phone) } }
    const selectedScope = scope
    const request = pending ?? attempt.current!.input
    const created = await command.run(async () => {
      rememberCustomerCreation(setSaved, request); pendingRef.current = true
      return createCustomer(request, selectedScope)
    })
    if (created && scopeRef.current === selectedScope) {
      try { setSaved('') } catch { setValidation('Cadastro confirmado; o navegador não conseguiu limpar a confirmação. Confira a mesma operação antes de continuar.'); return }
      pendingRef.current = false
      attempt.current = null
      const lookup = customerLookup(created)
      // A recovered intent may belong to an earlier optional sale; selecting it is explicit.
      if (restored.current) setRecovered(lookup)
      else onChange(lookup)
      restored.current = false; setCreating(false); setSearch(''); setName(''); setPhone('')
    } else if ([400, 422].includes(command.failureStatus())) { try { setSaved(''); pendingRef.current = false } catch { /* Keep the original checkpoint until its storage can be read again. */ } }
  }
  return <fieldset ref={root} className="customer-picker" disabled={locked} aria-label={label}>
    <legend>{label}{required ? ' *' : ' (opcional)'}</legend>
    {required && <select className="customer-selection-validator" tabIndex={-1} aria-label={`${label} selecionado`} required value={value?.id ?? ''} onChange={() => {}} onInvalid={() => { setValidation('Selecione um cliente cadastrado.'); input.current?.focus() }}><option value="">Selecione um cliente</option>{value && <option value={value.id}>{value.name}</option>}</select>}
    {!readable ? <p>Seu acesso não permite consultar clientes neste atendimento.</p> : <>
      {invalidPending && <p role="alert">Há uma confirmação anterior que não pôde ser lida. Peça à gestão para conferir antes de iniciar outro cadastro.</p>}
      {recovered && !value && <div className="customer-merge-review" role="status"><p>Cadastro recuperado: <strong>{recovered.name}</strong> · {recovered.phoneHint || 'Telefone pendente'} · {customerReference(recovered.id)}. Confira se é a pessoa deste atendimento.</p><button type="button" className="secondary-link" onClick={() => { onChange(recovered); setRecovered(null) }}>Selecionar cliente recuperado</button></div>}
      {value ? <div className="customer-selection"><strong>{value.name}</strong><small className="customer-reference">{customerReference(value.id)}</small>{value.phoneHint && <span>{value.phoneHint}</span>}{value.incomplete && <span className="status-pill arena-warning">Telefone pendente</span>}<button type="button" className="text-button" onClick={() => { onChange(null); setSearch(''); setSubmitted(''); setValidation(''); requestAnimationFrame(() => input.current?.focus()) }}>Trocar cliente</button>{!required && <button type="button" className="text-button" onClick={() => onChange(null)}>Continuar sem identificar</button>}</div> : !creating ? <>
        <label className="operation-field" htmlFor={id}>{`Buscar ${label.toLocaleLowerCase('pt-BR')}`}<input id={id} ref={input} type="search" value={search} maxLength={240} autoComplete="off" placeholder="Nome ou telefone" aria-describedby={id + '-hint'} onChange={event => { setSearch(event.target.value); setSubmitted('') }} /></label>
        <p className="arena-hint" id={id + '-hint'}>Digite ao menos 3 caracteres. O cadastro é independente do login e do acesso aos pagamentos.</p>
        {shown && <div className="customer-search-results" aria-live="polite">
          {results.isFetching ? <p role="status">Buscando clientes…</p> : results.isError ? <p role="alert">Não foi possível buscar clientes. <button type="button" className="text-button" onClick={() => void results.refetch()}>Tentar novamente</button></p> : results.data && <>
            {results.data.map(person => <button className="customer-option" type="button" key={person.id} aria-label={`${person.name} · ${person.phoneHint || 'Telefone pendente'}${person.incomplete ? ' · Cadastro incompleto' : ''} · ${customerReference(person.id)}`} onClick={() => { onChange(person); setSearch(''); setSubmitted(''); setValidation('') }}><strong>{person.name}</strong><span>{person.phoneHint || 'Telefone pendente'}</span>{person.incomplete && <small>Cadastro incompleto</small>}<small className="customer-reference">{customerReference(person.id)}</small></button>)}
            {!results.data.length && <p>Nenhum cliente encontrado. Confira a busca antes de cadastrar.</p>}
            {results.data.length >= 20 && <p>Refine a busca para identificar a pessoa correta.</p>}
          </>}
        </div>}
        {writable && <button type="button" className="secondary-link" onClick={() => { setName(search.trim()); setCreating(true); setValidation('') }}>+ Cadastrar cliente</button>}
        {validation && <p role="alert">{validation}</p>}
      </> : <div className="customer-inline-create" role="group" aria-label="Novo cliente" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void save() } }}>
        {pending && <p role="status">A criação de {pending.name} ainda precisa de confirmação. Confira a mesma operação antes de alterar os dados ou cadastrar outra pessoa.{!required && ' Este atendimento pode continuar sem identificar o cliente; a confirmação fica guardada para recuperação.'}</p>}
        <p>Confira os resultados para evitar cadastro duplicado. A identificação de possíveis duplicados é revisada pela equipe.</p>
        <label className="operation-field">Nome do novo cliente<input autoFocus disabled={Boolean(saved)} maxLength={240} autoComplete="name" value={pending?.name ?? name} onChange={event => setName(event.target.value)} /></label>
        <label className="operation-field">Telefone do novo cliente<input disabled={Boolean(saved)} type="tel" inputMode="tel" autoComplete="tel" maxLength={30} value={pending?.phone ?? phone} onChange={event => setPhone(event.target.value)} /></label>
        {validation && <p role="alert">{validation}</p>}
        <div className="form-actions"><button type="button" className="primary-button" disabled={!writable || command.busy || invalidPending} onClick={() => void save()}>{command.busy ? 'Cadastrando…' : pending ? 'Conferir criação pendente' : 'Cadastrar e selecionar'}</button><button type="button" className="secondary-link" disabled={command.busy || Boolean(saved)} onClick={() => setCreating(false)}>Voltar à busca</button></div>
      </div>}
      {command.error && <p role="alert">{command.error}{command.conflict && ' Confira o cadastro antes de repetir; o formulário foi preservado.'}</p>}
    </>}
  </fieldset>
}
