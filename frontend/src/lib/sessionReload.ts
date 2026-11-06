import { waitForPendingSessionRefresh, withSessionCookieLock } from './http'

export function reloadPage() {
  window.location.reload()
}

/** Do not abandon a refresh after the server may already have rotated its cookie. */
export async function reloadAfterSessionRequests(reload: () => void = reloadPage) {
  await waitForPendingSessionRefresh()
  await withSessionCookieLock(() => new Promise<void>(resolve => {
    let finished = false
    let timer: number | undefined
    const finish = () => {
      if (finished) return
      finished = true
      window.removeEventListener('pagehide', finish)
      if (timer !== undefined) window.clearTimeout(timer)
      resolve()
    }
    window.addEventListener('pagehide', finish, { once: true })
    // A refused or cancelled navigation must not leave other tabs locked.
    timer = window.setTimeout(finish, 2_000)
    try { reload() }
    catch { finish() } // Navigation was attempted; do not issue a second reload.
  }))
}
