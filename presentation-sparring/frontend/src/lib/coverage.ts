/** Share of slides whose key content was actually covered, as a 0–100 percentage. */
export function coverageRate(coverage: { covered: boolean }[]): number {
  if (coverage.length === 0) return 100
  const covered = coverage.filter((c) => c.covered).length
  return Math.round((covered / coverage.length) * 100)
}
