export interface SplitResult {
  laloAmount: number
  aleAmount: number
  laloPct: number
  alePct: number
}

export function calculateSplit(
  totalAmount: number,
  laloIncome: number,
  aleIncome: number,
): SplitResult {
  const total = laloIncome + aleIncome
  if (total === 0) {
    return { laloAmount: 0, aleAmount: 0, laloPct: 50, alePct: 50 }
  }
  const laloPct = (laloIncome / total) * 100
  const alePct = (aleIncome / total) * 100
  const laloAmount = Math.round((totalAmount * laloPct) / 100 * 100) / 100
  const aleAmount = Math.round((totalAmount - laloAmount) * 100) / 100
  return { laloAmount, aleAmount, laloPct, alePct }
}

export function formatPct(value: number): string {
  return `${value.toFixed(2)}%`
}
