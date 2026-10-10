import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    google?: { accounts: { id: {
      initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void
      renderButton: (element: HTMLElement, options: { theme: string; size: string; width: number; text: string }) => void
    } } }
  }
}

export function GoogleSignInButton({ onCredential, onError, disabled = false, clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '' }: {
  onCredential: (credential: string) => void; onError: (message: string) => void; disabled?: boolean; clientId?: string
}) {
  const element = useRef<HTMLDivElement>(null)
  const handlers = useRef({ onCredential, onError, disabled })
  useEffect(() => { handlers.current = { onCredential, onError, disabled } }, [onCredential, onError, disabled])
  useEffect(() => {
    if (!clientId) return
    let active = true
    const render = () => {
      if (!active || !element.current || !window.google) return
      window.google.accounts.id.initialize({ client_id: clientId, callback: ({ credential }) => {
        if (active && !handlers.current.disabled) handlers.current.onCredential(credential)
      } })
      element.current.replaceChildren()
      window.google.accounts.id.renderButton(element.current, {
        theme: 'outline', size: 'large', width: Math.min(360, element.current.clientWidth || 280), text: 'continue_with',
      })
    }
    const failed = () => { if (active) handlers.current.onError('Não foi possível carregar o Google. Recarregue a página para tentar novamente.') }
    let script = document.querySelector<HTMLScriptElement>('script[data-google-identity]')
    if (window.google) render()
    else {
      const exists = Boolean(script)
      script ??= document.createElement('script')
      script.addEventListener('load', render)
      script.addEventListener('error', failed)
      if (!exists) {
        script.src = 'https://accounts.google.com/gsi/client?hl=pt-BR'
        script.async = true; script.defer = true; script.dataset.googleIdentity = 'true'
        document.head.append(script)
      }
    }
    return () => { active = false; script?.removeEventListener('load', render); script?.removeEventListener('error', failed) }
  }, [clientId])
  return clientId ? <div ref={element} className="google-signin-button" aria-busy={disabled} /> : null
}
