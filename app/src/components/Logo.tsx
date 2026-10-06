type LogoProps = { compact?: boolean }

/** Original artwork from the Arena LongBeach Canva kit; SVG wrappers preserve its raster pixels. */
export function Logo({ compact = false }: LogoProps) {
  return <div className={`brand${compact ? ' brand-compact' : ''}`} aria-label="Long Beach OS">
    <img className={compact ? 'brand-mark' : 'brand-logo'} src={compact ? '/prototype-assets/logo-symbol.svg' : '/prototype-assets/logo-horizontal.svg'} alt="Long Beach Arena" />
    {!compact && <span className="brand-system">Gestão da arena</span>}
  </div>
}
