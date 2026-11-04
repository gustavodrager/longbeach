import { describe, expect, it } from 'vitest'
import { canonicalMoneyValue, documentValue, formatDocument, formatMoneyInput, formatMonth, formatPhone, moneyProblem, parseMoneyInput, phoneValue } from './inputFormatting'

describe('reais sem conversão implícita para centavos', () => {
  it.each([['1234', '1234'], ['1.234,56', '1234.56'], ['R$ 1.234,56', '1234.56'], ['1.234', '1234'], ['12.50', '12.50'], ['0.123', '0.123'], ['-1.234,56', '-1234.56'], [',50', '0.50'], ['0,00', '0.00'], ['', ''], ['7,', '7.']])('normaliza %s sem alterar a unidade', (input, expected) => expect(parseMoneyInput(input)).toBe(expected))
  it('preserva custos fracionários e não arredonda valores inválidos', () => {
    expect(parseMoneyInput('0.123', 6)).toBe('0.123')
    expect(parseMoneyInput('1.234', 6)).toBe('1.234')
    expect(parseMoneyInput('1.234567', 6)).toBe('1.234567')
    expect(parseMoneyInput('1.234.567', 6)).toBe('1234567')
    expect(parseMoneyInput('R$ 1.234', 6)).toBe('1234')
    expect(formatMoneyInput('0.123456', 6)).toBe('R$ 0,123456')
    expect(formatMoneyInput('0.123')).toBe('0.123')
    expect(moneyProblem('0.123')).toMatch(/2 casas/)
    expect(parseMoneyInput('1,2300')).toBe('1.23')
  })
  it('exibe zeros, negativos e milhares com duas casas e preserva vazio', () => {
    expect(formatMoneyInput(1234.56)).toBe('R$ 1.234,56')
    expect(formatMoneyInput(0)).toBe('R$ 0,00')
    expect(formatMoneyInput(-12)).toBe('-R$ 12,00')
    expect(parseMoneyInput('-R$ 1.234,56')).toBe('-1234.56')
    expect(formatMoneyInput('')).toBe('')
    expect(canonicalMoneyValue(0.1 + 0.2)).toBe('0.3')
  })
  it.each(['1e3', '1,2,3', '12.34,56', 'NaN', '123abc'])('não aceita dinheiro ambíguo ou inválido %s', value => expect(moneyProblem(parseMoneyInput(value))).not.toBe(''))
})

describe('contato e documentos, sem reescrever registros antigos', () => {
  it('formata fixo, celular e DDI brasileiro sem truncar telefone internacional', () => {
    expect(formatPhone('11987654321')).toBe('(11) 98765-4321')
    expect(formatPhone('1134567890')).toBe('(11) 3456-7890')
    expect(formatPhone('5511987654321')).toBe('+55 (11) 98765-4321')
    expect(formatPhone('+14155552671')).toBe('+14155552671')
    expect(phoneValue('+55 (11) 98765-4321')).toBe('+5511987654321')
    expect(formatPhone('Contato antigo a conferir')).toBe('Contato antigo a conferir')
    expect(formatPhone('')).toBe('')
  })
  it('formata CPF/CNPJ, preservando outras referências livres', () => {
    expect(formatDocument('12345678901')).toBe('123.456.789-01')
    expect(formatDocument('12345678000199')).toBe('12.345.678/0001-99')
    expect(documentValue('12.345.678/0001-99')).toBe('12345678000199')
    expect(formatDocument('NF-2026-123')).toBe('NF-2026-123')
    expect(formatDocument('123456789012345')).toBe('123456789012345')
  })
  it('exibe competência em mês/ano sem criar data ou fuso', () => {
    expect(formatMonth('2026-11')).toBe('11/2026')
    expect(formatMonth('2026-13')).toBe('2026-13')
    expect(formatMonth('')).toBe('')
  })
})
