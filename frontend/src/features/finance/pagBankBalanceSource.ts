type BalanceSource = { date: string | null; sourceName: string | null; sourceCell: string | null }

function validDate(date: string | null): date is string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const parsed = new Date(`${date}T12:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date
}

export function pagBankBalanceSource(bank: BalanceSource | undefined) {
  const portal = /^pagbank-portal-manual-v1:[a-f0-9]{64}:saldo$/.test(bank?.sourceCell ?? '')
  const date = bank?.date ?? null
  const displayDate = validDate(date) ? date.split('-').reverse().join('/') : null
  if (!portal) return {
    kind: 'statement' as const,
    label: 'Saldo da conta PagBank · extrato importado',
    reference: displayDate ? `Saldo informado em ${displayDate}` : 'Data do saldo a confirmar',
    explanation: 'Último extrato importado. Este valor não acompanha o saldo atual da conta.',
  }

  // Este formato de origem registra a hora local da consulta em São Paulo.
  const stamp = /^PagBank-portal-autenticado-saldo-(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.json$/.exec(bank?.sourceName ?? '')
  const consultedDate = stamp ? `${stamp[1]}-${stamp[2]}-${stamp[3]}` : null
  const time = stamp && validDate(consultedDate) && consultedDate === date &&
    Number(stamp[4]) < 24 && Number(stamp[5]) < 60 && Number(stamp[6]) < 60
    ? `${stamp[4]}:${stamp[5]}` : null
  return {
    kind: 'portal' as const,
    label: 'Saldo da conta PagBank · consultado no portal',
    reference: displayDate
      ? `Consultado no portal em ${displayDate}${time ? ` às ${time} · horário de São Paulo` : ' · horário não informado'}`
      : 'Data e horário da consulta não informados',
    explanation: 'Consulta manual. O saldo não é atualizado automaticamente.',
  }
}
