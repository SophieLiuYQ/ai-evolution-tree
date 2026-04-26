type BandKey = string | number;

// ===== Year band styling (subtle neutral + frontier highlight)
//
// The reference UI uses near-white rows with one soft green "frontier"
// band to anchor attention. We compute the frontier year in the view
// (latest year strictly < current year) and highlight that band.
export function bandColor(
  key: BandKey,
  idx: number,
  frontierKey?: BandKey,
): string {
  if (frontierKey != null && key === frontierKey) {
    return "var(--graph-band-highlight, var(--accent-soft))";
  }
  // Alternating ultra-light stripes (barely visible; avoids rainbow).
  return idx % 2 === 0
    ? "transparent"
    : "var(--graph-band-alt, rgba(15, 23, 42, 0.012))";
}

export function bandHeader(
  key: BandKey,
  frontierKey?: BandKey,
): string {
  if (frontierKey != null && key === frontierKey) {
    return "var(--accent)";
  }
  return "var(--fg-muted)";
}
