import { useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Disclosure, EditorPanel, useUnsavedChanges } from '../../components/managementUi'
import { ApiError } from '../../lib/http'
import { today, validDate } from '../../pages/arenaUi'
import { allocationFields } from './businessUnits'
import { expenseApi, expenseMoney, expenseMoneyInput, parseExpenseMoney, teamPaymentBasis, type ExpenseDetail, type ExpenseOptions, type ExpensePaidBy, type NewExpense } from './expenses'

export type ExpensePurchasePrefill = { id: string; description: string; amount: number; expenseDate: string; expenseId: string | null }
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível confirmar o lançamento. Seus dados foram preservados. Tente novamente.'

export function ExpenseForm({ options, onClose, onSaved, purchase }: { options: ExpenseOptions; onClose: () => void; onSaved: (detail: ExpenseDetail) => void; purchase?: ExpensePurchasePrefill }) {
  const client = useQueryClient(); const guard = useUnsavedChanges(); const day = today()
  const draftId = useRef(crypto.randomUUID()); const partnerDraftId = useRef(crypto.randomUUID()); const lock = useRef(false)
  const attempt = useRef<NewExpense | null>(null)
  const [kind, setKind] = useState<'Expense' | 'Team'>('Expense')
  const [description, setDescription] = useState(purchase?.description ?? ''); const [amount, setAmount] = useState(purchase ? expenseMoneyInput(purchase.amount) : '')
  const [teamId, setTeamId] = useState(''); const [basis, setBasis] = useState<'Monthly' | 'Daily'>('Monthly')
  const [referenceMonth, setReferenceMonth] = useState(day.slice(0, 7)); const [workDate, setWorkDate] = useState(day); const [shift, setShift] = useState('')
  const [paidBy, setPaidBy] = useState<ExpensePaidBy>('Pending'); const [dueDate, setDueDate] = useState(day)
  const [expenseDate, setExpenseDate] = useState(purchase?.expenseDate ?? day); const [paidDate, setPaidDate] = useState(day)
  const [allocation, setAllocation] = useState(purchase ? 'bar' : 'unclassified'); const [partnerId, setPartnerId] = useState('')
  const [partners, setPartners] = useState(options.partners); const [addingPartner, setAddingPartner] = useState(false); const [partnerName, setPartnerName] = useState('')
  const [notes, setNotes] = useState(''); const [documentReference, setDocumentReference] = useState(''); const [paymentMethod, setPaymentMethod] = useState('Outro'); const [accountReference, setAccountReference] = useState('')
  const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false); const [partnerBusy, setPartnerBusy] = useState(false); const [error, setError] = useState(''); const [partnerError, setPartnerError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const person = options.team.find(value => value.id === teamId)
  const derivedBasis = teamPaymentBasis(person); const activeBasis = derivedBasis ?? basis

  function selectPerson(id: string) {
    const selected = options.team.find(value => value.id === id)
    setTeamId(id); setAmount(selected?.payAmount != null && selected.payAmount > 0 ? expenseMoneyInput(selected.payAmount) : '')
    setShift(''); if (teamPaymentBasis(selected)) setBasis(teamPaymentBasis(selected)!)
  }
  async function addPartner() {
    if (lock.current || !partnerName.trim()) return
    lock.current = true; setPartnerBusy(true); setPartnerError('')
    try {
      const created = await expenseApi.partner({ id: partnerDraftId.current, name: partnerName.trim() })
      setPartners(current => [...current.filter(value => value.id !== created.id), created]); setPartnerId(created.id)
      setAddingPartner(false); setPartnerName(''); partnerDraftId.current = crypto.randomUUID()
      void client.invalidateQueries({ queryKey: ['expenses', 'options'] })
    } catch (cause) { setPartnerError(errorMessage(cause)) }
    finally { lock.current = false; setPartnerBusy(false) }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current) return
    const value = parseExpenseMoney(amount)
    if (value === null) { setError('Informe um valor maior que zero, com até duas casas decimais.'); return }
    if (!validDate(expenseDate) || expenseDate > day || paidBy === 'Company' && (!validDate(paidDate) || paidDate > day)) { setError('Confira as datas do lançamento e do pagamento, até hoje.'); return }
    if (paidBy === 'Pending' && !validDate(dueDate)) { setError('Informe o vencimento.'); return }
    if (paidBy === 'Partner' && !partnerId) { setError('Selecione o sócio que usou dinheiro próprio.'); return }
    if (kind === 'Team' && (!person || activeBasis === 'Monthly' && !/^\d{4}-\d{2}$/.test(referenceMonth) || activeBasis === 'Daily' && (!validDate(workDate) || workDate > day))) { setError('Confira a pessoa e o período trabalhado.'); return }
    if (kind === 'Expense' && !description.trim()) { setError('Informe a descrição.'); return }
    const body: NewExpense = attempt.current ?? {
      description: kind === 'Team' ? `${person!.name} · ${activeBasis === 'Monthly' ? 'pagamento mensal' : 'diária/turno'}` : description.trim(),
      kind, category: kind === 'Team' ? 'Equipe' : 'Outras despesas', beneficiary: kind === 'Team' ? person!.name : '',
      amount: value, paidBy, dueDate: paidBy === 'Pending' ? dueDate : null, expenseDate,
      origin: allocation === 'bar' ? 'Bar' : 'Arena', ...allocationFields(allocation),
      notes: notes.trim(), documentReference: documentReference.trim(),
      ...(kind === 'Team' ? { teamMemberId: teamId, teamBasis: activeBasis, ...(activeBasis === 'Monthly' ? { referenceMonth } : { workDate, shift: shift.trim() }) } : {}),
      ...(paidBy === 'Partner' ? { partnerId } : {}),
      ...(paidBy === 'Company' ? { paidDate, paymentMethod, accountReference: accountReference.trim() } : {}),
      ...(purchase ? { purchaseId: purchase.id } : {}),
    }
    attempt.current = body; lock.current = true; setBusy(true); setError('')
    try {
      const saved = await expenseApi.create(draftId.current, body)
      guard.markSaved(); setDirty(false); onSaved(saved)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) {
        attempt.current = null; setUncertain(false); setError(cause.message)
      } else {
        setUncertain(true); setError('Não foi possível confirmar o lançamento. Tente novamente para consultar ou concluir o mesmo registro. Seus dados foram preservados.')
      }
    }
    finally { lock.current = false; setBusy(false) }
  }

  return <EditorPanel title={purchase ? 'Pagamento da compra' : 'Novo lançamento'} onClose={onClose} busy={busy || partnerBusy} hasUnsavedChanges={dirty} className="expenses-editor">
    <form className="operation-form" onSubmit={submit} onChange={() => setDirty(true)}>
      {error && <p role="alert" className="expenses-error">{error}</p>}
      <fieldset disabled={busy || partnerBusy || uncertain}>
        <div className="field-grid">
          {purchase ? <div className="operation-field-wide"><h3>{purchase.description}</h3><p>{expenseMoney(purchase.amount)}</p><p className="expenses-muted">Dados da compra cadastrada no Bar.</p></div> : <label className="operation-field operation-field-wide">Lançamento<select value={kind} onChange={event => { setKind(event.target.value as typeof kind); setAmount(''); setTeamId('') }}><option value="Expense">Despesa ou compra</option><option value="Team">Pagamento da equipe</option></select></label>}
          {kind === 'Expense' && !purchase && <label className="operation-field operation-field-wide">Descrição<input required maxLength={200} value={description} onChange={event => setDescription(event.target.value)} placeholder="Ex.: material de limpeza" autoFocus /></label>}
          {kind === 'Team' && <>
            <label className="operation-field operation-field-wide">Pessoa<select required value={teamId} onChange={event => selectPerson(event.target.value)}><option value="">Selecione a pessoa</option>{options.team.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
            {!options.team.length && <p className="expenses-muted operation-field-wide">Nenhuma pessoa disponível. <Link to="/equipe">Cadastrar na equipe</Link></p>}
            {person && <>
              {!derivedBasis && <label className="operation-field">Formato<select value={basis} onChange={event => setBasis(event.target.value as typeof basis)}><option value="Monthly">Mensal</option><option value="Daily">Diária/turno</option></select></label>}
              {activeBasis === 'Monthly' ? <label className="operation-field">Mês trabalhado<input type="month" required max={day.slice(0, 7)} value={referenceMonth} onChange={event => setReferenceMonth(event.target.value)} /></label> : <>
                <label className="operation-field">Dia trabalhado<input type="date" required max={day} value={workDate} onChange={event => setWorkDate(event.target.value)} /></label>
                <label className="operation-field">Turno (opcional)<input maxLength={80} value={shift} onChange={event => setShift(event.target.value)} placeholder="Ex.: noite" /></label>
              </>}
            </>}
          </>}
          {!purchase && <label className="operation-field">Valor devido (R$)<input required inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0,00" /></label>}
          <label className="operation-field">Situação<select value={paidBy} onChange={event => setPaidBy(event.target.value as ExpensePaidBy)}><option value="Pending">A pagar</option><option value="Company">Pago pela empresa</option><option value="Partner">Pago por um sócio</option></select></label>
          {paidBy === 'Pending' && <label className="operation-field">Vencimento<input required type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} /></label>}
          {paidBy === 'Company' && <label className="operation-field">Data do pagamento<input required type="date" max={day} value={paidDate} onChange={event => setPaidDate(event.target.value)} /></label>}
          {paidBy === 'Partner' && <div className="operation-field-wide">
            <label className="operation-field">Sócio que usou dinheiro próprio<select required value={partnerId} onChange={event => setPartnerId(event.target.value)}><option value="">Selecione o sócio</option>{partners.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
            <button type="button" className="expenses-link" onClick={() => setAddingPartner(value => !value)}>{addingPartner ? 'Fechar cadastro de sócio' : '+ Cadastrar sócio aqui'}</button>
            {addingPartner && <div className="expenses-inline"><label className="operation-field">Nome do sócio<input value={partnerName} maxLength={160} onChange={event => setPartnerName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void addPartner() } }} /></label><button type="button" disabled={!partnerName.trim()} onClick={() => void addPartner()}>Cadastrar e selecionar</button></div>}
            {partnerError && <p role="alert" className="expenses-error">{partnerError}</p>}
            <p className="expenses-muted">O valor ficará a reembolsar para esse sócio.</p>
          </div>}
          {!purchase && <label className="operation-field">Unidade<select value={allocation} onChange={event => setAllocation(event.target.value)}><option value="unclassified">A classificar</option><option value="bar">Bar</option><option value="quadra">Quadra</option><option value="shared">Compartilhado</option></select></label>}
        </div>
        <Disclosure title="Data e observação (opcional)"><div className="field-grid">
          <label className="operation-field">Data do lançamento<input required type="date" max={day} value={expenseDate} disabled={Boolean(purchase)} onChange={event => setExpenseDate(event.target.value)} /></label>
          <label className="operation-field">Referência do comprovante<input maxLength={200} value={documentReference} onChange={event => setDocumentReference(event.target.value)} placeholder="Ex.: nota 123" /></label>
          <label className="operation-field operation-field-wide">Observação<textarea rows={3} maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} /></label>
          {paidBy === 'Company' && <><label className="operation-field">Forma de pagamento<select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)}><option value="Outro">Não informada</option><option value="Pix">Pix</option><option value="Dinheiro">Dinheiro</option><option value="Transferência">Transferência</option><option value="Cartão">Cartão</option></select></label><label className="operation-field">Conta de origem<input maxLength={100} value={accountReference} onChange={event => setAccountReference(event.target.value)} /></label></>}
        </div></Disclosure>
      </fieldset>
      <div className="form-actions"><button className="primary-button" type="submit" disabled={busy || partnerBusy}>{busy ? 'Salvando…' : uncertain ? 'Tentar confirmar novamente' : 'Salvar lançamento'}</button><button className="secondary-link" type="button" disabled={busy || partnerBusy} onClick={onClose}>Cancelar</button></div>
    </form>
  </EditorPanel>
}
