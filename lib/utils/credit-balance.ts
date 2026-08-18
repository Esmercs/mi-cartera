// El saldo de un crédito NO se guarda en una columna: se deriva del ledger. Así,
// borrar un abono mal capturado corrige el saldo solo, y cada peso es rastreable
// (mismo principio que el ledger de tarjetas).

export interface MovementLike {
  kind: string
  amount: number | string     // Postgres DECIMAL llega como string por el driver
  effective_date: string
  accrual_month?: string | null
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** Saldo considerando solo los movimientos con effective_date <= `dateStr`. */
export function balanceAsOf(movements: MovementLike[], dateStr: string): number {
  const total = movements
    .filter(m => m.effective_date <= dateStr)
    .reduce((s, m) => {
      const amt = Number(m.amount)
      return s + (m.kind === 'payment' ? -amt : amt)
    }, 0)
  return r2(total)
}

/** Interés devengado en un mes `yyyy-MM`. 0 si ese mes no se ha devengado. */
export function splitInterest(movements: MovementLike[], monthKey: string): number {
  return r2(movements
    .filter(m => m.kind === 'interest' && (m.accrual_month ?? '').startsWith(monthKey))
    .reduce((s, m) => s + Number(m.amount), 0))
}
