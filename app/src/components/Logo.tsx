type LogoProps = { compact?: boolean; tagline?: string }

/** Original artwork from the Arena LongBeach Canva kit; SVG wrappers preserve its raster pixels. */
export function Logo({ compact = false, tagline = 'Gestão da arena' }: LogoProps) {
  return <div className={`brand${compact ? ' brand-compact' : ''}`} aria-label="Long Beach Arena">
    <img className={compact ? 'brand-mark' : 'brand-logo'} src={compact ? '/prototype-assets/logo-symbol.svg' : '/prototype-assets/logo-horizontal.svg'} alt="Long Beach Arena" />
    {!compact && <span className="brand-system">{tagline}</span>}
  </div>
}
