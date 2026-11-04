/** Form values stay in reais/ISO/digits; these helpers only change their presentation. */
export function parseMoneyInput(value: string, decimalPlaces = 2): string {
  const explicitCurrency = /^\s*[+-]?\s*R\$/.test(value)
  const text = value.trim().replace(/^([+-]?)\s*R\$\s*/i, '$1').replace(/[\s\u00a0\u202f]/g, '').replace(/\u2212/g, '-')
  if (!text || text === '-' || text === '+') return text
  let canonical = text
  if (text.includes(',')) {
    const parts = text.split(',')
    if (parts.length !== 2 || !/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+)?$/.test(parts[0]) || !/^\d*$/.test(parts[1])) return text
    canonical = `${parts[0].replace(/\./g, '')}.${parts[1]}`
  } else if (/^[+-]?[1-9]\d{0,2}(?:\.\d{3})+$/.test(text) && (explicitCurrency || decimalPlaces <= 2 || text.split('.').length > 2)) canonical = text.replace(/\./g, '')
  if (!/^[+-]?\d*(?:\.\d*)?$/.test(canonical)) return text
  canonical = canonical.replace(/^\+/, '').replace(/^(-?)0+(?=\d)/, '$1').replace(/^(-?)\./, (_, sign: string) => `${sign}0.`)
  const fraction = canonical.split('.')[1]
  if (fraction && fraction.length > decimalPlaces && !/[1-9]/.test(fraction.slice(decimalPlaces))) canonical = canonical.slice(0, canonical.indexOf('.') + 1 + decimalPlaces)
  return canonical
}

export function canonicalMoneyValue(value: string | number, decimalPlaces = 2): string {
  if (typeof value === 'string') return /[,]|R\$/.test(value) ? parseMoneyInput(value, decimalPlaces) : value
  if (!Number.isFinite(value)) return ''
  const rounded = Number(value.toFixed(decimalPlaces))
  return String(Math.abs(value - rounded) <= Number.EPSILON * Math.max(1, Math.abs(value)) * 4 ? rounded : value)
}

export function moneyProblem(value: string, decimalPlaces = 2): string {
  if (value === '') return ''
  if (!/^-?\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value))) return 'Informe um valor válido em reais.'
  const fraction = value.split('.')[1] ?? ''
  if (fraction.length > decimalPlaces && /[1-9]/.test(fraction.slice(decimalPlaces))) return `Use até ${decimalPlaces} casas decimais.`
  return ''
}

export function formatMoneyInput(value: string | number, decimalPlaces = 2): string {
  const canonical = canonicalMoneyValue(value, decimalPlaces)
  if (canonical === '') return ''
  if (moneyProblem(canonical, decimalPlaces)) return String(value)
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: Math.max(2, decimalPlaces) }).format(Number(canonical)).replace(/\u00a0/g, ' ')
}

export function phoneValue(value: string): string {
  return /^\+?[\d\s().-]*$/.test(value) ? `${value.trim().startsWith('+') ? '+' : ''}${value.replace(/\D/g, '')}` : value
}

export function formatPhone(value?: string | null): string {
  if (!value) return ''
  const canonical = phoneValue(value)
  if (!/^\+?\d*$/.test(canonical)) return value
  let digits = canonical.replace(/\D/g, '')
  let prefix = ''
  if (canonical.startsWith('+55') || (digits.startsWith('55') && [12, 13].includes(digits.length))) { prefix = '+55 '; digits = digits.slice(2) }
  else if (canonical.startsWith('+') || digits.length > 11) return canonical
  if (!digits) return prefix.trim()
  if (digits.length <= 2) return `${prefix}(${digits}`
  const local = digits.slice(2)
  const split = local.length > 8 ? 5 : 4
  return `${prefix}(${digits.slice(0, 2)}) ${local.slice(0, split)}${local.length > split ? `-${local.slice(split)}` : ''}`
}

export function documentValue(value: string): string { return /^[\d\s./-]*$/.test(value) ? value.replace(/\D/g, '') : value }
export function formatDocument(value?: string | null): string {
  if (!value) return ''
  const digits = documentValue(value)
  if (!/^\d*$/.test(digits) || digits.length > 14) return value
  if (digits.length <= 11) return digits.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3}\.\d{3})(\d)/, '$1.$2').replace(/^(\d{3}\.\d{3}\.\d{3})(\d)/, '$1-$2')
  return digits.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2}\.\d{3})(\d)/, '$1.$2').replace(/^(\d{2}\.\d{3}\.\d{3})(\d)/, '$1/$2').replace(/^(\d{2}\.\d{3}\.\d{3}\/\d{4})(\d)/, '$1-$2')
}

export function formatMonth(value: string): string {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value)) return value
  return `${value.slice(5)}/${value.slice(0, 4)}`
}
