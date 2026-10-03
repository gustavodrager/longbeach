type LogoProps = {
  compact?: boolean
}

export function Logo({ compact = false }: LogoProps) {
  return (
    <div className="brand" aria-label="Long Beach OS">
      <svg className="brand-mark" viewBox="0 0 48 48" aria-hidden="true">
        <rect width="48" height="48" rx="13" fill="currentColor" />
        <path d="M8 30c5-4 10-5 15-2 6 4 12 3 19-2v7c-7 5-14 5-21 1-4-2-8-1-13 2z" fill="#e3b65d" />
        <path d="M9 24c4-3 8-4 12-1 6 3 11 3 20-4" fill="none" stroke="#21a8a4" strokeWidth="4" strokeLinecap="round" />
        <circle cx="34" cy="14" r="4" fill="#f5ddb0" />
      </svg>
      {!compact && (
        <span className="brand-copy">
          <strong>Long Beach</strong>
          <small>OS</small>
        </span>
      )}
    </div>
  )
}
