import { useState, type ChangeEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../lib/http'
import { centsMoney, type HistoryPreview } from './FinancialHistory'
import { prepareBankStatement, type StatementBank, type StatementPackage } from './bankStatementImport'
import './bank-statement-import.css'

export function BankStatementImport({ onApplied }: { onApplied: () => Promise<unknown> }) {
  const cache = useQueryClient()
  const [bank, setBank] = useState<StatementBank>('pagbank')
  const [account, setAccount] = useState('')
  const [prepared, setPrepared] = useState<StatementPackage>()
  const [preview, setPreview] = useState<HistoryPreview>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const clear = () => { setPrepared(undefined); setPreview(undefined); setError(''); setMessage('') }
  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget; const file = input.files?.[0]
    clear(); if (!file) return
    setBusy(true)
    try { setPrepared(await prepareBankStatement({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), bank, account })) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível ler o extrato.') }
    finally { input.value = ''; setBusy(false) }
  }
  async function inspect() {
    if (!prepared || busy) return
    setBusy(true); setError(''); setPreview(undefined)
    try {
      const staged = await apiFetch<{ id: string }>('/api/v1/imports', { method: 'POST', body: JSON.stringify(prepared) })
      setPreview(await apiFetch<HistoryPreview>(`/api/v1/financial-history/imports/${staged.id}`))
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível conferir o extrato.') }
    finally { setBusy(false) }
  }
  async function apply() {
    if (!preview || preview.applied || busy) return
    setBusy(true); setError('')
    try {
      const result = await apiFetch<HistoryPreview>(`/api/v1/financial-history/imports/${preview.batchId}/apply`, { method: 'POST', body: JSON.stringify({ confirmationToken: preview.confirmationToken }) })
      setPreview(result)
      setMessage('Extrato aplicado. Movimentos repetidos foram preservados uma única vez; os saldos mantêm a data do arquivo.')
      await Promise.allSettled([
        ...['financial-history', 'dashboard-balances', 'current-financial-position', 'c6-statement'].map(queryKey => cache.invalidateQueries({ queryKey: [queryKey] })),
        onApplied(),
      ])
    } catch (failure) { setPreview(undefined); setError(failure instanceof Error ? failure.message : 'Confira o extrato novamente antes de aplicar.') }
    finally { setBusy(false) }
  }
  const rows = prepared?.records.map(row => row.data) ?? []
  const movements = rows.filter(row => row.grain === 'day')
  const balances = rows.filter(row => row.grain === 'snapshot')
  return <section className="foundation-card bank-statement-import" aria-labelledby="bank-import-title" id="extratos-bancarios">
    <h2 id="bank-import-title">Importar extratos</h2>
    <p>OFX ou CSV. A importação não registra vendas nem baixa contas.</p>
    <div className="compact-filters">
      <label className="operation-field">Banco do extrato<select value={bank} disabled={busy} onChange={event => { clear(); setBank(event.target.value as StatementBank) }}><option value="pagbank">PagBank</option><option value="c6">C6</option></select></label>
      <label className="operation-field">Número da conta no CSV<input value={account} maxLength={160} disabled={busy} placeholder="Mesmo número informado no OFX, incluindo zeros" onChange={event => { clear(); setAccount(event.target.value) }} /></label>
      <label className="operation-field">Arquivo OFX ou CSV<input type="file" accept=".ofx,.csv" disabled={busy} onChange={event => void selectFile(event)} /></label>
    </div>
    <details><summary>Formato CSV aceito</summary><p>OFX identifica a conta pelo arquivo. No CSV, use o mesmo número da conta do extrato, incluindo zeros, para reconhecer transações já importadas.</p><p>Cabeçalho: <code>Data;Descrição;Valor;ID;Saldo</code>. Data em DD/MM/AAAA ou AAAA-MM-DD; entrada positiva e saída negativa; valores como 1234,56. O ID deve ser o identificador da transação no banco. Saldo é opcional e deve conter uma única posição por data; deixe vazio nos demais movimentos. Também é possível importar somente Data e Saldo. Arquivos com até 2.000 registros e 5 MB.</p><p>Exemplo fictício:</p><pre>Data;Descrição;Valor;ID;Saldo{'\n'}25/10/2026;Pix recebido;100,00;PIX-EXEMPLO;150,00</pre></details>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {prepared && <div aria-label="Prévia do arquivo bancário"><h3>{bank === 'c6' ? 'C6' : 'PagBank'} · {prepared.sourceName}</h3><p>{movements.length} movimento(s) · {balances.length} saldo(s) informado(s).</p><p>Entradas: {centsMoney(movements.filter(row => row.amountCents >= 0).reduce((sum, row) => sum + row.amountCents, 0))} · Saídas: {centsMoney(Math.abs(movements.filter(row => row.amountCents < 0).reduce((sum, row) => sum + row.amountCents, 0)))}</p>
      {balances.map(row => <p key={row.sourceCell}>Saldo informado em {row.periodStart.split('-').reverse().join('/')}: {centsMoney(row.amountCents)}</p>)}
      {!preview && <button type="button" className="button-primary" disabled={busy} onClick={() => void inspect()}>{busy ? 'Conferindo…' : 'Conferir importação'}</button>}
    </div>}
    {preview && <div aria-label="Conferência do extrato"><p>{preview.creates} registro(s) novo(s) · {preview.matches} já importado(s).</p><p>Confirme o banco, as datas e os valores apresentados acima. Os saldos não são somados entre si.</p>{preview.applied ? <p role="status">Arquivo já aplicado.</p> : <button type="button" className="button-primary" disabled={busy} onClick={() => void apply()}>{busy ? 'Aplicando…' : 'Aplicar extrato conferido'}</button>}</div>}
  </section>
}
