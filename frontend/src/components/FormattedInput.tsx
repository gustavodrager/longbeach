import { useImperativeHandle, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type Ref } from 'react'
import { canonicalMoneyValue, documentValue, formatDocument, formatMoneyInput, formatPhone, moneyProblem, parseMoneyInput, phoneValue } from '../lib/inputFormatting'

type Format = 'money' | 'phone' | 'document'
export type FormattedInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'type' | 'onChange'> & {
  format: Format
  value?: string | number
  defaultValue?: string | number
  onValueChange?: (value: string) => void
  decimalPlaces?: number
  ref?: Ref<HTMLInputElement>
}

/** A visible localized input and, when named, a canonical FormData value. */
export function FormattedInput({ format, value, defaultValue = '', onValueChange, decimalPlaces = 2, name, pattern, minLength, maxLength, min, max, step: _step, onFocus, onBlur, onKeyDown, ref: forwardedRef, ...props }: FormattedInputProps) {
  const canonicalize = (input: string | number) => format === 'money' ? canonicalMoneyValue(input, decimalPlaces) : format === 'phone' ? phoneValue(String(input)) : documentValue(String(input))
  const present = (input: string) => format === 'money' ? formatMoneyInput(input, decimalPlaces) : format === 'phone' ? formatPhone(input) : formatDocument(input)
  const source = canonicalize(value ?? defaultValue)
  const [model, setModel] = useState(() => ({ source, canonical: source, draft: present(source) }))
  const [focused, setFocused] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useImperativeHandle(forwardedRef, () => input.current!, [])
  const caret = useRef<number | null>(null)
  const lastEdited = useRef<string | null>(null)
  if (value !== undefined && source !== model.source) {
    const sameNumber = format === 'money' && lastEdited.current === model.canonical && Number.isFinite(Number(source)) && Number(source) === Number(model.canonical)
    setModel(sameNumber ? { ...model, source } : { source, canonical: source, draft: present(source) })
    if (!sameNumber) lastEdited.current = null
  }

  useLayoutEffect(() => {
    const element = input.current
    if (!element) return
    let error = props.required && !model.canonical.trim() ? 'Preencha este campo.' : format === 'money' ? moneyProblem(model.canonical, decimalPlaces) : ''
    if (!error && model.canonical && pattern) { try { if (!new RegExp(`^(?:${pattern})$`).test(model.canonical)) error = 'Confira o formato informado.' } catch { error = 'Confira o formato informado.' } }
    if (!error && model.canonical && minLength !== undefined && model.canonical.length < minLength) error = `Informe pelo menos ${minLength} caracteres.`
    if (!error && maxLength !== undefined && model.canonical.length > maxLength) error = `Use no máximo ${maxLength} caracteres.`
    if (!error && format === 'money' && model.canonical) {
      if (min !== undefined && Number(model.canonical) < Number(min)) error = `O valor mínimo é ${formatMoneyInput(String(min), decimalPlaces)}.`
      if (max !== undefined && Number(model.canonical) > Number(max)) error = `O valor máximo é ${formatMoneyInput(String(max), decimalPlaces)}.`
    }
    element.setCustomValidity(error)
    if (caret.current !== null) { element.setSelectionRange(caret.current, caret.current); caret.current = null }
  }, [model.canonical, model.draft, decimalPlaces, format, pattern, minLength, maxLength, min, max, props.required])

  const edit = (text: string, position: number | null) => {
    const continuingDecimal = format === 'money' && /^-?\d*\.\d*$/.test(model.draft) && model.draft.includes('.') && text.startsWith(model.draft) && /^-?\d*\.\d*$/.test(text)
    let canonical = format === 'money' ? continuingDecimal ? text : parseMoneyInput(text, decimalPlaces) : canonicalize(text)
    if (format === 'phone' && model.draft.startsWith('+55 ') && !model.canonical.startsWith('+')) canonical = canonical.replace(/^\+/, '')
    const draft = format === 'money' ? text : present(canonical)
    if (format !== 'money' && position !== null) {
      const count = (text.slice(0, position).match(/\d/g) ?? []).length
      let seen = 0
      caret.current = count === 0 ? draft.startsWith('+') && position > 0 ? 1 : 0 : draft.length
      for (let i = 0; i < draft.length; i++) if (/\d/.test(draft[i]) && ++seen === count) { caret.current = i + 1; break }
    }
    setModel(current => ({ ...current, canonical, draft }))
    lastEdited.current = canonical
    if (canonical !== model.canonical) onValueChange?.(canonical)
  }

  return <><input {...props} ref={input} type={format === 'phone' ? 'tel' : 'text'} lang="pt-BR" inputMode={props.inputMode ?? (format === 'money' ? 'decimal' : format === 'phone' ? 'tel' : 'numeric')}
    value={model.draft} onChange={event => edit(event.target.value, event.target.selectionStart)}
    onFocus={event => { setFocused(true); if (format === 'money' && !moneyProblem(model.canonical, decimalPlaces)) setModel(current => ({ ...current, draft: current.draft.replace(/^([+-]?)R\$\s*/, '$1') })); onFocus?.(event) }}
    onBlur={event => { setFocused(false); if (format !== 'money' || !moneyProblem(model.canonical, decimalPlaces)) setModel(current => ({ ...current, draft: present(current.canonical) })); onBlur?.(event) }}
    onKeyDown={event => {
      onKeyDown?.(event)
      if (event.defaultPrevented || format === 'money' || event.ctrlKey || event.metaKey || event.altKey || !['Backspace', 'Delete'].includes(event.key)) return
      const element = event.currentTarget; const start = element.selectionStart; const end = element.selectionEnd
      if (start === null || start !== end) return
      const backwards = event.key === 'Backspace'; const at = backwards ? start - 1 : start
      if (at < 0 || at >= model.draft.length || /\d/.test(model.draft[at])) return
      let index = at
      while (index >= 0 && index < model.draft.length && !/\d/.test(model.draft[index])) index += backwards ? -1 : 1
      if (index < 0 || index >= model.draft.length) return
      event.preventDefault()
      edit(model.draft.slice(0, backwards ? index : start) + model.draft.slice(backwards ? start : index + 1), backwards ? index : start)
    }} data-format={format} data-editing={focused || undefined} />{name && <input type="hidden" name={name} form={props.form} value={model.canonical} disabled={props.disabled} />}</>
}
