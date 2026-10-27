export type CardFields = { holder: string; number: string; expMonth: string; expYear: string; securityCode: string }
type CardResult = { hasErrors: boolean; encryptedCard?: string }
declare global { interface Window { PagSeguro?: { encryptCard: (input: CardFields & { publicKey: string }) => CardResult } } }
let loading: Promise<void> | undefined
export async function encryptCard(publicKey: string, fields: CardFields) {
  if (!window.PagSeguro) {
    loading ??= new Promise<void>((resolve, reject) => {
      const script = document.createElement('script'); script.src = 'https://assets.pagseguro.com.br/checkout-sdk-js/rc/dist/browser/pagseguro.min.js'; script.async = true
      const failed = () => { loading = undefined; script.remove(); clearTimeout(timeout); reject(new Error('Não foi possível preparar o cartão. Confira a conexão.')) }; const timeout = window.setTimeout(failed, 15000)
      script.onload = () => { clearTimeout(timeout); resolve() }; script.onerror = failed
      document.head.appendChild(script)
    })
    await loading
  }
  const result = window.PagSeguro?.encryptCard({ ...fields, publicKey })
  if (!result || result.hasErrors || !result.encryptedCard) throw new Error('Confira os dados do cartão.')
  return result.encryptedCard
}
