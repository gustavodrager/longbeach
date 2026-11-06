export function SessionRestoreNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <main className="session-loading" role="alert">
    <span>{message}</span>
    <button className="secondary-link" type="button" disabled={!onRetry} onClick={onRetry}>Tentar novamente</button>
  </main>
}
