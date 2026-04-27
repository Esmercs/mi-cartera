import { addDays, addMonths, addWeeks, format, parseISO, isBefore } from 'date-fns'
import { es } from 'date-fns/locale'
import type { IntervalType } from '@/types/database'

export function formatMXDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return format(parseISO(dateStr), "d 'de' MMMM yyyy", { locale: es })
}

export function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return format(parseISO(dateStr), 'dd/MM/yyyy')
}

export function isOverdue(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  return isBefore(parseISO(dateStr), new Date())
}

export function nextPaymentDate(
  currentDate: string,
  interval: IntervalType,
): string {
  const date = parseISO(currentDate)
  switch (interval) {
    case 'quincenal':
    case 'c/15 dias':
      return format(addDays(date, 15), 'yyyy-MM-dd')
    case 'mensual':
      return format(addMonths(date, 1), 'yyyy-MM-dd')
    case 'bimestral':
      return format(addMonths(date, 2), 'yyyy-MM-dd')
    case 'trimestral':
      return format(addMonths(date, 3), 'yyyy-MM-dd')
    case 'anual':
      return format(addMonths(date, 12), 'yyyy-MM-dd')
    case 'c/21 dias':
      return format(addWeeks(date, 3), 'yyyy-MM-dd')
    default:
      return format(addMonths(date, 1), 'yyyy-MM-dd')
  }
}

// Quincena definitions:
// State A (payDay=15): day 15 → day (lastDay-1) of the same month
// State B (payDay=30): last day of month → day 14 of next month

function lastDayOf(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate()
}

// Returns whether today is in State B (last-day → 14th window)
function inStateB(day: number, lastDay: number): boolean {
  return day >= lastDay || day < 15
}

export function getCurrentPeriodDates(): { start: Date; end: Date; label: string } {
  const now = new Date()
  const day = now.getDate()
  const y = now.getFullYear()
  const m = now.getMonth()
  const ld = lastDayOf(y, m)

  if (!inStateB(day, ld)) {
    // State A: 15 → ld-1
    const start = new Date(y, m, 15)
    const end   = new Date(y, m, ld - 1)
    return { start, end, label: `15–${ld - 1} ${format(now, 'MMM yyyy', { locale: es })}` }
  } else if (day >= ld) {
    // State B just started: ld(this month) → 14(next month)
    const start = new Date(y, m, ld)
    const nm = m + 1 > 11 ? 0 : m + 1
    const ny = m + 1 > 11 ? y + 1 : y
    const end = new Date(ny, nm, 14)
    return { start, end, label: `${ld} ${format(start, 'MMM', { locale: es })} – 14 ${format(end, 'MMM yyyy', { locale: es })}` }
  } else {
    // State B from last month: ld(prev month) → 14(this month)
    const pm = m - 1 < 0 ? 11 : m - 1
    const py = m - 1 < 0 ? y - 1 : y
    const pld = lastDayOf(py, pm)
    const start = new Date(py, pm, pld)
    const end   = new Date(y, m, 14)
    return { start, end, label: `${pld} ${format(start, 'MMM', { locale: es })} – 14 ${format(end, 'MMM yyyy', { locale: es })}` }
  }
}

// Returns period dates for the Nth upcoming quincena (0 = next from today, 1 = after that, etc.)
export function getOffsetPeriodDates(offset: number): {
  start: Date; end: Date; label: string; payDay: 15 | 30
} {
  const now = new Date()
  const day = now.getDate()
  const ld  = lastDayOf(now.getFullYear(), now.getMonth())

  // Determine starting state for "next" quincena (offset=0)
  let isB: boolean
  let m = now.getMonth()
  let y = now.getFullYear()

  if (!inStateB(day, ld)) {
    // In A → next is B starting on ld of this month
    isB = true
  } else if (day >= ld) {
    // In B (just started) → next is A: 15 of next month
    isB = false
    m++; if (m > 11) { m = 0; y++ }
  } else {
    // In B (started last month, day < 15) → next is A: 15 of this month
    isB = false
  }

  for (let i = 0; i < offset; i++) {
    if (isB) {
      // B → A: 15 of month after B's end-month (B ends on 14 of m+1)
      isB = false
      m++; if (m > 11) { m = 0; y++ }
    } else {
      // A → B: starts on lastDay of m
      isB = true
    }
  }

  if (isB) {
    const ld2 = lastDayOf(y, m)
    const start = new Date(y, m, ld2)
    const nm = m + 1 > 11 ? 0 : m + 1
    const ny = m + 1 > 11 ? y + 1 : y
    const end = new Date(ny, nm, 14)
    return {
      start, end, payDay: 30,
      label: `${ld2} de ${format(start, 'MMMM yyyy', { locale: es })}`,
    }
  } else {
    const ld2 = lastDayOf(y, m)
    const start = new Date(y, m, 15)
    const end   = new Date(y, m, ld2 - 1)
    return {
      start, end, payDay: 15,
      label: `15 de ${format(start, 'MMMM yyyy', { locale: es })}`,
    }
  }
}

// Used by deudas page — returns start/end of next upcoming quincena
export function getNextPeriodDates(): { start: Date; end: Date; label: string } {
  const { start, end, label } = getOffsetPeriodDates(0)
  return { start, end, label }
}

// Returns the next payment cutoff (payDay) from today's perspective
export function getNextPaymentDay(): { day: 15 | 30; label: string } {
  const { payDay, end } = getOffsetPeriodDates(0)
  return { day: payDay, label: format(end, "d 'de' MMM yyyy", { locale: es }) }
}

export function intervalLabel(interval: IntervalType): string {
  const labels: Record<IntervalType, string> = {
    quincenal: 'Quincenal',
    mensual: 'Mensual',
    bimestral: 'Bimestral',
    trimestral: 'Trimestral',
    'c/15 dias': 'Cada 15 días',
    'c/21 dias': 'Cada 21 días',
    anual: 'Anual',
  }
  return labels[interval] ?? interval
}
