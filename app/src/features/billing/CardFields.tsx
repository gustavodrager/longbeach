import type { CardFields as Fields } from './card'
export const emptyCard: Fields = { holder: '', number: '', expMonth: '', expYear: '', securityCode: '' }
export function CardFields({ value, change, disabled }: { value: Fields; change: (v: Fields) => void; disabled: boolean }) {
  const fields: { key: keyof Fields; label: string; length: number; numeric?: boolean; autocomplete: string }[] = [
    { key: 'holder', label: 'Nome no cartão', length: 100, autocomplete: 'cc-name' },
    { key: 'number', label: 'Número do cartão', length: 19, numeric: true, autocomplete: 'cc-number' },
    { key: 'expMonth', label: 'Mês de validade', length: 2, numeric: true, autocomplete: 'cc-exp-month' },
    { key: 'expYear', label: 'Ano de validade (4 dígitos)', length: 4, numeric: true, autocomplete: 'cc-exp-year' },
    { key: 'securityCode', label: 'Código de segurança', length: 4, numeric: true, autocomplete: 'cc-csc' },
  ]
  return <fieldset disabled={disabled}><legend>Crédito à vista</legend>{fields.map(f => <label className="ux-field" key={f.key}>{f.label}<input required type={f.key === 'securityCode' ? 'password' : 'text'} autoComplete={f.autocomplete} inputMode={f.numeric ? 'numeric' : 'text'} maxLength={f.length} value={value[f.key]} onChange={e => change({ ...value, [f.key]: f.numeric ? e.target.value.replace(/\D/g, '') : e.target.value })} /></label>)}</fieldset>
}
