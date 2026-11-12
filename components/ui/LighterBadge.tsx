/**
 * Lighter's official "Powered by Lighter" badge (lighter.xyz/brand-kit, downloaded 2026-11-12),
 * shown where Zolva uses Lighter's perps data. "Powered by" rather than "Built on": Zolva's perps
 * agents trade on paper and read Lighter's hourly prices and funding. Both theme variants are
 * rendered and CSS shows the one that matches the site theme.
 */
export function LighterBadge({ height = 28 }: { height?: number }) {
  const width = Math.round((height * 802) / 192);
  return (
    <a className="lighter-badge" href="https://lighter.xyz" target="_blank" rel="noopener noreferrer" aria-label="Powered by Lighter">
      <img className="lighter-badge__img lighter-badge__img--light" src="/img/partners/powered-by-lighter-light.svg" alt="" width={width} height={height} />
      <img className="lighter-badge__img lighter-badge__img--dark" src="/img/partners/powered-by-lighter-dark.svg" alt="" width={width} height={height} />
    </a>
  );
}
