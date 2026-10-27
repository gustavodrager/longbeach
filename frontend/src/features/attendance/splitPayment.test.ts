import { describe, expect, it } from 'vitest'
import { splitPayment } from './splitPayment'
describe('divisão da comanda', () => {
  it('distribui todos os centavos entre pagamentos sucessivos', () => {
    const first = splitPayment(10, '3')!
    const second = splitPayment(first.remaining, '2')!
    expect([first.first, second.first, second.remaining]).toEqual([3.34, 3.33, 3.33])
    expect(first.first + second.first + second.remaining).toBe(10)
  })
  it.each(['0', '1', '101', '2.5', '-2', 'x'])('rejeita quantidade inválida %s', people => {
    expect(splitPayment(10, people)).toBeNull()
  })
  it('não gera parcelas de zero', () => expect(splitPayment(0.01, '2')).toBeNull())
})
