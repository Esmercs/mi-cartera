// Matemática de créditos. Funciones puras: sin Supabase, sin leer la fecha del
// sistema, sin efectos. Todo lo que decide dinero vive aquí para poder verificarlo
// aislado con scripts/verify-credit-math.mjs.
//
// Sin IVA sobre el interés: son préstamos personales, no tarjetas de crédito
// (las tarjetas mexicanas sí lo cobran — ver la nota de extensión en el spec).

const r2 = (n: number) => Math.round(n * 100) / 100

/** Tasa mensual a partir de la anual en porcentaje. 24 → 0.02 */
export function monthlyRate(annualRate: number): number {
  return annualRate / 100 / 12
}

/** Interés que devenga un saldo en un mes, a centavos. */
export function accruedInterest(balance: number, annualRate: number): number {
  if (balance <= 0 || annualRate <= 0) return 0
  return r2(balance * monthlyRate(annualRate))
}

/**
 * Cuota fija que amortiza `principal` en exactamente `termMonths` pagos.
 * Con tasa 0 es una división simple — no se divide entre cero.
 */
export function amortizedPayment(principal: number, annualRate: number, termMonths: number): number {
  if (termMonths <= 0 || principal <= 0) return 0
  const i = monthlyRate(annualRate)
  if (i === 0) return r2(principal / termMonths)
  return r2(principal * i / (1 - Math.pow(1 + i, -termMonths)))
}

export interface PayoffProjection {
  months: number             // meses que faltan; 0 si ya está liquidado o si nunca liquida
  remainingInterest: number  // interés que queda por devengar
  neverPaysOff: boolean      // la cuota no alcanza a cubrir el interés
}

/**
 * Proyecta la liquidación abonando siempre la misma cuota.
 *
 * Si la cuota no cubre el interés del mes, la deuda crece para siempre: eso se
 * reporta con `neverPaysOff` en lugar de iterar en balde. El tope de 600 (50 años)
 * existe igual como red por si el redondeo estanca el saldo sin disparar esa condición.
 */
export function projectPayoff(
  balance: number,
  annualRate: number,
  monthlyPayment: number,
): PayoffProjection {
  if (balance <= 0) return { months: 0, remainingInterest: 0, neverPaysOff: false }
  if (monthlyPayment <= 0) return { months: 0, remainingInterest: 0, neverPaysOff: true }

  let bal = balance
  let interest = 0
  let months = 0
  while (bal > 0.005 && months < 600) {
    const i = accruedInterest(bal, annualRate)
    if (i >= monthlyPayment) return { months: 0, remainingInterest: 0, neverPaysOff: true }
    months++
    interest += i
    bal = r2(bal + i - Math.min(monthlyPayment, bal + i))
  }
  if (months >= 600) return { months: 0, remainingInterest: 0, neverPaysOff: true }
  return { months, remainingInterest: r2(interest), neverPaysOff: false }
}
