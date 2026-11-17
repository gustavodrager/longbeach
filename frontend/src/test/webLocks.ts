/** jsdom lacks Web Locks; serialize named locks like the browser, including rejection release. */
export function testWebLocks() {
  const tails = new Map<string, Promise<unknown>>()
  return { request<T>(name: string, callback: (lock: { name: string }) => Promise<T> | T): Promise<T> {
    const result = (tails.get(name) ?? Promise.resolve()).catch(() => {}).then(() => callback({ name }))
    tails.set(name, result.catch(() => {}))
    return result
  } }
}
