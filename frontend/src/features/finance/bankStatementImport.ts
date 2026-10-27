export type StatementBank = 'pagbank' | 'c6'
type Observation = { entity: 'financial-observation-v1'; currency: 'BRL'; sourceCell: string; series: string; metric: string; label: string; state: string; periodStart: string; periodEnd: string; grain: 'day' | 'snapshot'; amountCents: number; notes: string }
export type StatementPackage = { sourceName: string; sourceSha256: string; records: { sheetName: string; rowNumber: number; recordType: 'reference-data'; externalId: string; data: Observation }[] }
type Entry = { date: string; amount: number; label: string; id: string; kind: 'movement' | 'balance' }
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const sha = async (value: Uint8Array | string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value)))).map(byte => byte.toString(16).padStart(2, '0')).join('')

function dateOnly(value: string, ofx = false) {
  const text = value.trim()
  const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
  const compact = ofx && /^\d{8}(?:\d{6}(?:\.\d{1,6})?)?(?:\[[+-]?\d+(?:\.\d+)?(?::[A-Za-z]+)?\])?$/.test(text)
  const date = parts ? `${parts[3]}-${parts[2]}-${parts[1]}` : compact ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}` : text
  const instant = new Date(`${date}T12:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== date || date < '2000-01-01' || date > '2100-12-31') throw new Error(`Data inválida no extrato: ${text.slice(0, 30)}.`)
  return date
}

function moneyCents(value: string) {
  let text = value.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '')
  if (/^\(.*\)$/.test(text)) text = `-${text.slice(1, -1)}`
  if (text.includes(',') && text.includes('.')) {
    const brazil = text.lastIndexOf(',') > text.lastIndexOf('.')
    const pattern = brazil ? /^[+-]?\d{1,3}(\.\d{3})*,\d{1,2}$/ : /^[+-]?\d{1,3}(,\d{3})*\.\d{1,2}$/
    if (!pattern.test(text)) throw new Error('Valor monetário inválido. Use 1234,56 ou 1234.56.')
    text = brazil ? text.replaceAll('.', '').replace(',', '.') : text.replaceAll(',', '')
  } else text = text.replace(',', '.')
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(text)) throw new Error('Valor monetário inválido ou ambíguo. Use 1234,56 ou 1234.56.')
  const cents = Math.round(Number(text) * 100)
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > 99999999999) throw new Error('Valor fora do limite de importação.')
  return cents
}

function csvRows(text: string) {
  const first = text.split(/\r?\n/, 1)[0]
  const separator = first.includes(';') ? ';' : first.includes('\t') ? '\t' : ','
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index++ }
      else if (!field || quoted) quoted = !quoted
      else throw new Error('Aspas inválidas no CSV.')
    } else if (!quoted && (char === separator || char === '\n' || char === '\r')) {
      row.push(field.trim()); field = ''
      if (char !== separator) { if (row.some(Boolean)) rows.push(row); row = []; if (char === '\r' && text[index + 1] === '\n') index++ }
    } else field += char
  }
  if (quoted) throw new Error('Uma célula do CSV está com aspas abertas.')
  row.push(field.trim()); if (row.some(Boolean)) rows.push(row)
  return rows
}

function csvEntries(text: string): Entry[] {
  const [header, ...rows] = csvRows(text)
  if (!header || !rows.length) throw new Error('O CSV precisa de cabeçalho e registros.')
  const names = header.map(normalize)
  if (new Set(names).size !== names.length) throw new Error('O CSV contém colunas duplicadas. Confira o cabeçalho.')
  const column = (aliases: string[]) => names.findIndex(name => aliases.includes(name))
  const date = column(['data', 'date', 'datalancamento', 'datamovimento'])
  const label = column(['descricao', 'historico', 'description', 'memo'])
  const amount = column(['valor', 'valorr', 'amount'])
  const id = column(['id', 'fitid', 'identificador', 'codigo', 'idtransacao', 'codigotransacao'])
  const balance = column(['saldo', 'saldor', 'saldofinal', 'balance'])
  if (date < 0 || amount < 0 && balance < 0) throw new Error('CSV não reconhecido. Use Data;Descrição;Valor;ID;Saldo. Valor é positivo para entrada e negativo para saída; Saldo é opcional.')
  const entries: Entry[] = []
  rows.forEach((row, index) => {
    if (row.length !== header.length) throw new Error(`Linha ${index + 2}: quantidade de colunas diferente do cabeçalho.`)
    const day = dateOnly(row[date])
    if (amount >= 0 && row[amount] !== '') {
      if (id < 0 || !row[id]) throw new Error(`Linha ${index + 2}: informe o ID da transação para evitar movimentos duplicados entre arquivos. Você também pode usar OFX.`)
      entries.push({ date: day, amount: moneyCents(row[amount]), label: label < 0 || !row[label] ? 'Movimento no extrato' : row[label], id: row[id], kind: 'movement' })
    }
    if (balance >= 0 && row[balance] !== '') entries.push({ date: day, amount: moneyCents(row[balance]), label: 'Saldo informado no extrato', id: day, kind: 'balance' })
  })
  return entries
}

function ofxEntries(text: string) {
  // Accept both OFX SGML (unclosed value tags) and XML without executing markup.
  const tag = (body: string, name: string) => new RegExp(`<${name}\\s*>([^<\\r\\n]*)`, 'i').exec(body)?.[1].trim() ?? ''
  const statements = [...text.matchAll(/<STMTRS\s*>([\s\S]*?)<\/STMTRS\s*>/gi)]
  if (statements.length !== 1 || [...text.matchAll(/<STMTRS\b[^>]*>/gi)].length !== 1) throw new Error('Selecione um OFX com exatamente uma conta bancária completa.')
  const body = statements[0][1]
  if (tag(body, 'CURDEF').toUpperCase() !== 'BRL') throw new Error('O extrato deve informar a moeda BRL.')
  const account = tag(body, 'ACCTID')
  if (!account || [...body.matchAll(/<ACCTID\b[^>]*>/gi)].length !== 1) throw new Error('O OFX deve informar uma única conta bancária.')
  const entries: Entry[] = []
  const transactions = [...body.matchAll(/<STMTTRN\s*>([\s\S]*?)<\/STMTTRN\s*>/gi)]
  if (transactions.length !== [...body.matchAll(/<STMTTRN\b[^>]*>/gi)].length || transactions.length !== [...body.matchAll(/<\/STMTTRN\s*>/gi)].length) throw new Error('O OFX contém transações incompletas. Exporte o arquivo novamente.')
  for (const item of transactions) {
    const data = item[1]; const id = tag(data, 'FITID')
    if (!id) throw new Error('Movimento OFX sem FITID. O ID é necessário para evitar duplicações.')
    entries.push({ date: dateOnly(tag(data, 'DTPOSTED'), true), amount: moneyCents(tag(data, 'TRNAMT')), label: tag(data, 'MEMO') || tag(data, 'NAME') || 'Movimento no extrato', id, kind: 'movement' })
  }
  const ledgers = [...body.matchAll(/<LEDGERBAL\s*>([\s\S]*?)<\/LEDGERBAL\s*>/gi)]
  if (ledgers.length > 1 || ledgers.length !== [...body.matchAll(/<LEDGERBAL\b[^>]*>/gi)].length || ledgers.length !== [...body.matchAll(/<\/LEDGERBAL\s*>/gi)].length) throw new Error('O OFX deve conter uma única posição de saldo completa.')
  const ledger = ledgers[0]?.[1]
  if (ledger) {
    const day = dateOnly(tag(ledger, 'DTASOF'), true)
    entries.push({ date: day, amount: moneyCents(tag(ledger, 'BALAMT')), label: 'Saldo informado no extrato', id: day, kind: 'balance' })
  }
  return { entries, account }
}

export async function prepareBankStatement(input: { name: string; bytes: Uint8Array; bank: StatementBank; account?: string }): Promise<StatementPackage> {
  if (!['pagbank', 'c6'].includes(input.bank)) throw new Error('Selecione C6 ou PagBank.')
  if (input.bytes.length > 5_000_000) throw new Error('O arquivo deve ter até 5 MB.')
  let text = new TextDecoder('utf-8', { fatal: false }).decode(input.bytes).replace(/^\uFEFF/, '')
  if (text.includes('\uFFFD')) text = new TextDecoder('windows-1252').decode(input.bytes)
  const ofx = /\.ofx$/i.test(input.name)
  if (!ofx && !/\.csv$/i.test(input.name)) throw new Error('Selecione um arquivo OFX ou CSV.')
  const parsed = ofx ? ofxEntries(text) : { entries: csvEntries(text), account: input.account?.trim() ?? '' }
  if (!normalize(parsed.account) || parsed.account.length > 160) throw new Error('Informe a identificação da conta conforme aparece no extrato CSV. Use sempre a mesma identificação para esta conta.')
  if (!parsed.entries.length || parsed.entries.length > 2000) throw new Error('O arquivo deve conter de 1 a 2.000 movimentos e saldos. Exporte um período menor.')
  const accountHash = (await sha(normalize(parsed.account))).slice(0, 16)
  const byIdentity = new Map<string, Observation>()
  for (const entry of parsed.entries) {
    if (entry.label.length > 240 || entry.id.length > 500) throw new Error('Descrição ou ID do movimento excede o limite. Confira o arquivo.')
    if (entry.kind === 'movement' && entry.amount === 0) throw new Error('Movimento com valor zero. Para informar apenas o saldo, use as colunas Data e Saldo.')
    const kind = entry.kind
    const sourceCell = `bank-v1:${input.bank}:${accountHash}:${kind}:${(await sha(entry.id)).slice(0, 32)}`
    const data: Observation = { entity: 'financial-observation-v1', currency: 'BRL', sourceCell, series: kind === 'balance' ? 'saldos' : `${input.bank}-conta`, metric: kind === 'balance' ? `Saldo ${input.bank === 'c6' ? 'C6' : 'Pagbank'}` : entry.amount < 0 ? 'saidas-extrato' : 'entradas-extrato', label: entry.label, state: 'Informado no extrato', periodStart: entry.date, periodEnd: entry.date, grain: kind === 'balance' ? 'snapshot' : 'day', amountCents: entry.amount, notes: `Banco: ${input.bank}; conta: ${accountHash}; ID: ${entry.id}` }
    const existing = byIdentity.get(sourceCell)
    if (existing && JSON.stringify(existing) !== JSON.stringify(data)) throw new Error('Há valores diferentes para o mesmo ID de movimento ou saldo da mesma data. Exporte um arquivo com uma única posição de saldo por dia.')
    byIdentity.set(sourceCell, data)
  }
  return { sourceName: input.name, sourceSha256: await sha(input.bytes), records: [...byIdentity.values()].map((data, index) => ({ sheetName: input.bank === 'c6' ? 'Extrato C6' : 'Extrato PagBank', rowNumber: index + 1, recordType: 'reference-data', externalId: `finance:${data.sourceCell}`, data })) }
}
