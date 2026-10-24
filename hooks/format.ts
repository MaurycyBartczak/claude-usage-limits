// A token count in a few columns: "800", "8.1k", "1.3M"; `kDigits` 0 for "412k".
export function tokens(n: number, kDigits = 1): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(kDigits)}k`
  return String(n)
}
