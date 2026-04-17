// ===== Year band colors (warm → cool gradient)
export function bandColor(idx: number, total: number): string {
  const t = total <= 1 ? 0 : idx / (total - 1);
  const hue = 45 + t * 190;
  return `hsl(${hue}, 50%, 96.5%)`;
}

export function bandHeader(idx: number, total: number): string {
  const t = total <= 1 ? 0 : idx / (total - 1);
  const hue = 45 + t * 190;
  return `hsl(${hue}, 55%, 50%)`;
}
