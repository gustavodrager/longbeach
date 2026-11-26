/** jsdom lacks Web Locks. Model shared admission, exclusive sends and cancellable/nonblocking waits. */
export function testWebLocks() {
  type Held = { shared: number; exclusive: boolean }
  type Waiter = { mode: 'shared' | 'exclusive'; grant: () => void }
  const held = new Map<string, Held>()
  const waiting = new Map<string, Waiter[]>()
  function process(name: string) {
    const state = held.get(name) ?? { shared: 0, exclusive: false }
    held.set(name, state)
    const queue = waiting.get(name) ?? []
    while (queue.length && !state.exclusive) {
      if (queue[0].mode === 'exclusive' && state.shared > 0) break
      const next = queue.shift()!
      if (next.mode === 'shared') state.shared++
      else state.exclusive = true
      next.grant()
    }
  }
  return { request<T>(name: string, optionsOrCallback: LockOptions | ((lock: { name: string; mode: LockMode }) => Promise<T> | T), callback?: (lock: { name: string; mode: LockMode } | null) => Promise<T> | T): Promise<T> {
    const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback
    const work = (typeof optionsOrCallback === 'function' ? optionsOrCallback : callback) as (lock: { name: string; mode: LockMode } | null) => Promise<T> | T
    const abortReason = () => options.signal?.reason ?? new DOMException('The request was aborted.', 'AbortError')
    if (options.signal?.aborted) return Promise.reject(abortReason())
    const mode = options.mode ?? 'exclusive'
    const state = held.get(name) ?? { shared: 0, exclusive: false }
    held.set(name, state)
    const queue = waiting.get(name) ?? []
    waiting.set(name, queue)
    const unavailable = state.exclusive || mode === 'exclusive' && state.shared > 0 || queue.length > 0
    if (options.ifAvailable && unavailable) return Promise.resolve().then(() => work(null))
    return new Promise<T>((resolve, reject) => {
      const abort = () => {
        const index = queue.indexOf(waiter)
        if (index < 0) return
        queue.splice(index, 1); reject(abortReason()); process(name)
      }
      const waiter: Waiter = { mode, grant: () => {
        options.signal?.removeEventListener('abort', abort)
        const release = () => { if (mode === 'shared') state.shared--; else state.exclusive = false; process(name) }
        Promise.resolve().then(() => work({ name, mode })).then(value => { release(); resolve(value) }, error => { release(); reject(error) })
      } }
      options.signal?.addEventListener('abort', abort, { once: true })
      queue.push(waiter)
      process(name)
    })
  } }
}
