/** Allocate cents exactly; the next payment always starts from the refreshed payable balance. */
export function splitPayment(payable: number, people: string) {
  if (!/^\d+$/.test(people)) return null
  const count = Number(people), cents = Math.round(payable * 100)
  if (!Number.isSafeInteger(cents) || !Number.isInteger(count) || count < 2 || count > 100 || cents < count) return null
  const first = Math.ceil(cents / count)
  return { first: first / 100, remaining: (cents - first) / 100 }
}
