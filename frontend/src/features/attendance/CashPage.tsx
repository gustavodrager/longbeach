import { hasPermission } from '../auth/access'
import { TerminalReceipts } from './TerminalReceipts'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { BarFrame, LoadState } from './Core'
import { Feedback, Header, Icon } from './components'
import { dateTime, isOpen, money, parseAmount, postBar, useBarCommand, useBarData, useIntent, type CashClosing, type CashSession, type Named } from './api'

import { barLocation } from './serviceLocation'

export function MyCashPage() {
  const { user } = useAuth(); const sessions = useBarData<CashSession[]>('/cash/sessions'); const locations = useBarData<Named[]>('/cash/locations')
  const current = useBarData<{id:string;responsible:string}|null>('/cash/current');
  const session = sessions.data?.find(row => row.openedBy === user?.id && isOpen(row)); const command = useBarCommand(); const intent = useIntent(`cash:${session?.id ?? 'open'}`)
  const [value, setValue] = useState(''); const [reason, setReason] = useState(''); const [step, setStep] = useState(''); const [closing, setClosing] = useState<CashClosing | null>(null)
  const details = useBarData<{terminalReceipts?:{terminalType:string;amount:number;refunded:number}[]}>(`/cash/sessions/${session?.id}/details`, Boolean(session) && step === 'close')
  const locationId = barLocation(locations.data)?.id; const amount = parseAmount(value); const difference = session && Number.isFinite(amount) ? Math.round((amount - session.expected) * 100) / 100 : 0
  const supervisor = hasPermission(user, 'bar:supervise'); const changed = () => intent(step || 'open', true)
  async function open() {
    if (!locationId || locations.isError) { command.setError('Peça à gestão para conferir o cadastro do local Bar.'); return }
    if (!Number.isFinite(amount) || amount < 0) { command.setError('Informe o dinheiro inicial, incluindo zero.'); return }
    const result = await command.run(() => postBar<CashSession>('/cash/sessions', { locationId, terminal: 'Atendimento', opening: amount, operationId: intent('open') }))
    if (result.ok) { setValue(''); setClosing(null); command.setMessage('Caixa do Bar aberto.'); intent('open', true) }
  }
  async function move() {
    if (!session || !Number.isFinite(amount) || amount <= 0) { command.setError('Informe um valor maior que zero.'); return }
    const result = await command.run(() => postBar(`/cash/sessions/${session.id}/${step}`, { amount, reason, operationId: intent(step) }))
    if (result.ok) { intent(step, true); setValue(''); setReason(''); setStep(''); command.setMessage('Movimentação confirmada.') }
  }
  async function close() {
    if (!session || !Number.isFinite(amount) || amount < 0) { command.setError('Confira o dinheiro contado.'); return }
    const result = await command.run(() => postBar<CashClosing>(`/cash/sessions/${session.id}/close`, { counted: amount, reason: reason || null, operationId: intent('close'), expected: session.expected }))
    if (result.ok) { setClosing(result.value); setStep(''); setValue(''); setReason(''); intent('close', true); command.setMessage('Caixa fechado.') }
  }
  return <BarFrame><Header title="Caixa do Bar" description={user?.name ? `Responsável: ${user.name}` : 'Um responsável por turno.'} /><Feedback {...command} /><LoadState query={sessions} /><LoadState query={current} />{!session && current.data?.id && <p className="ux-notice">Caixa aberto · Responsável: {current.data.responsible}. Aguarde o fechamento do turno para abrir o seu.</p>}
    {closing && <section className="ux-panel"><h2>Fechamento confirmado</h2><dl className="ux-summary lb-cash-summary"><div><dt>Esperado</dt><dd>{money(closing.expected)}</dd></div><div><dt>Contado</dt><dd>{money(closing.counted)}</dd></div><div><dt>Diferença</dt><dd>{money(closing.difference)}</dd></div></dl></section>}
    {!sessions.isLoading && !sessions.isError && !current.isLoading && !current.isError && !current.data?.id && !session && <form className="ux-panel" onSubmit={event => { event.preventDefault(); void open() }}><h2>Abrir Caixa do Bar</h2><LoadState query={locations} />{!locations.isLoading && !locations.isError && !locationId && <p role="alert">Peça à gestão para conferir o cadastro do local Bar.</p>}<label className="ux-field">Dinheiro inicial (R$)<input required inputMode="decimal" placeholder="0,00" value={value} disabled={command.busy} onChange={event => { setValue(event.target.value); changed() }} /></label><button className="ux-button primary" disabled={command.busy || !locationId || locations.isError}>Abrir caixa</button></form>}
    {session && <><section className="ux-panel"><h2>Caixa aberto</h2><p className="ux-note">Aberto em {dateTime(session.createdAtUtc)}</p><dl className="ux-summary lb-cash-summary"><div><dt>Dinheiro inicial</dt><dd>{money(session.opening)}</dd></div><div><dt>Dinheiro esperado agora</dt><dd>{money(session.expected)}</dd></div></dl><div className="ux-actions">{[['supply', 'Colocar dinheiro', 'plus'], ['withdraw', 'Retirar dinheiro', 'minus'], ['close', 'Fechar caixa', 'cash']].map(([code, label, icon]) => <button className="ux-button secondary" key={code} disabled={command.busy} onClick={() => { setStep(code); setValue(''); setReason('') }}><Icon name={icon as 'cash'} />{label}</button>)}</div></section>
      {step && <form className="ux-panel" onSubmit={event => { event.preventDefault(); void (step === 'close' ? close() : move()) }}>{step === 'close' && <><LoadState query={details}/><TerminalReceipts rows={details.data?.terminalReceipts}/></>}<h2>{step === 'close' ? 'Conferir fechamento' : step === 'supply' ? 'Colocar dinheiro' : 'Retirar dinheiro'}</h2><label className="ux-field">{step === 'close' ? 'Dinheiro contado no caixa (R$)' : 'Valor (R$)'}<input required inputMode="decimal" value={value} disabled={command.busy} onChange={event => { setValue(event.target.value); changed() }} /></label>{step === 'close' && Number.isFinite(amount) && <p className="ux-amount">Diferença: {money(difference)}</p>}<label className="ux-field">{step === 'close' && difference === 0 ? 'Observação (opcional)' : 'Motivo obrigatório'}<input required={step !== 'close' || difference !== 0} minLength={3} maxLength={500} value={reason} disabled={command.busy} onChange={event => { setReason(event.target.value); changed() }} /></label>{step === 'close' && difference !== 0 && !supervisor && <p className="ux-notice error">Há diferença. Chame o supervisor para conferir e autorizar o fechamento. Seu caixa continua aberto.</p>}<div className="ux-actions"><button className="ux-button primary" disabled={command.busy || !Number.isFinite(amount) || (step === 'close' && difference !== 0 && !supervisor)}>{step === 'close' ? 'Confirmar fechamento' : 'Confirmar movimentação'}</button><button type="button" className="ux-button secondary" onClick={() => setStep('')}>Voltar</button></div><p className="ux-note">Comandas abertas atravessam turnos. Pagamentos pendentes precisam ser conferidos antes do fechamento.</p></form>}
    </>}{supervisor && <Link className="ux-button secondary" to="/bar/caixa?secao=historico">Histórico e conferência do caixa</Link>}
  </BarFrame>
}
