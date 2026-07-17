import type { ExpenseCategory, IntervalType } from '@/types/database'

// ── Categorías ──────────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  vivienda:      'Vivienda',
  servicios:     'Servicios',
  alimentacion:  'Alimentación',
  transporte:    'Transporte',
  suscripciones: 'Suscripciones',
  salud:         'Salud',
  diversion:     'Diversión',
  otros:         'Otros',
}

// Equivalente mensual de un gasto según su intervalo
export function monthlyEquivalent(amount: number, interval: IntervalType): number {
  switch (interval) {
    case 'quincenal':
    case 'c/15 dias':  return amount * 2
    case 'c/21 dias':  return amount * 1.45
    case 'mensual':    return amount
    case 'bimestral':  return amount / 2
    case 'trimestral': return amount / 3
    case 'anual':      return amount / 12
    default:           return amount
  }
}

// ── Benchmarks (guías generales de finanzas personales, % del ingreso mensual) ──

export interface Benchmark {
  key: string
  label: string
  cap: number          // % máximo recomendado (o mínimo si floor)
  floor?: boolean      // true = es un piso (ahorro), no un techo
  categories: string[] // categorías de gastos fijos que agrupa ('' = bucket derivado)
  why: string
}

export const BENCHMARKS: Benchmark[] = [
  {
    key: 'vivienda_servicios', label: 'Vivienda y servicios', cap: 35,
    categories: ['vivienda', 'servicios'],
    why: 'Renta, luz, agua, gas e internet no deberían rebasar el 35% del ingreso; arriba de eso el resto del presupuesto se asfixia.',
  },
  {
    key: 'alimentacion', label: 'Alimentación', cap: 15,
    categories: ['alimentacion'],
    why: 'La despensa y comida del hogar suele mantenerse sana hasta el 15% del ingreso.',
  },
  {
    key: 'transporte', label: 'Transporte', cap: 15,
    categories: ['transporte'],
    why: 'Auto, gasolina y seguro; más del 15% indica un auto caro para el ingreso actual.',
  },
  {
    key: 'suscripciones', label: 'Suscripciones', cap: 5,
    categories: ['suscripciones'],
    why: 'Streaming y servicios digitales son el gasto hormiga clásico: 5% es un tope generoso.',
  },
  {
    key: 'salud', label: 'Salud', cap: 10,
    categories: ['salud'],
    why: 'Seguros y gastos médicos recurrentes; hasta 10% es razonable como prevención.',
  },
  {
    key: 'diversion', label: 'Diversión', cap: 10,
    categories: ['diversion'],
    why: 'El ocio es necesario, pero se recomienda contenerlo en 10% del ingreso.',
  },
  {
    key: 'tarjetas', label: 'Compras a crédito (MSI y tarjetas)', cap: 20,
    categories: [],
    why: 'La carga mensual de pagos a tarjetas no debería superar el 20% del ingreso para no comprometer quincenas futuras.',
  },
  {
    key: 'ahorro', label: 'Ahorro y proyectos', cap: 10, floor: true,
    categories: [],
    why: 'Destinar al menos 10% del ingreso a ahorro o metas te da colchón ante imprevistos.',
  },
]

// ── Motor de análisis ────────────────────────────────────────────────────────

export interface AnalysisItem { concept: string; monthly: number }

export interface AnalysisInput {
  monthlyIncome: number
  // Gastos fijos mensualizados (mi parte), con su categoría
  fijos: { concept: string; monthly: number; category: string }[]
  diversionMonthly: number     // promedio mensual real (mi parte)
  tarjetasMonthly: number      // carga de cuotas del mes en curso
  tarjetasItems: AnalysisItem[]
  ahorroMonthly: number        // promedio mensual de abonos a proyectos
}

export type BucketStatus = 'ok' | 'warn' | 'over'

export interface BucketResult {
  key: string
  label: string
  monthly: number
  pct: number
  cap: number
  floor: boolean
  status: BucketStatus
  why: string
  items: AnalysisItem[]
}

export interface Recommendation {
  severity: 'over' | 'warn' | 'info'
  title: string
  detail: string
}

export interface AnalysisResult {
  buckets: BucketResult[]      // en el orden de BENCHMARKS + "Otros" al final
  otros: BucketResult | null   // sin benchmark, informativo
  recommendations: Recommendation[]
  committedMonthly: number     // todo excepto ahorro
  committedPct: number
  freeMonthly: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function analyzeFinances(input: AnalysisInput): AnalysisResult {
  const income = input.monthlyIncome
  const pctOf = (n: number) => (income > 0 ? (n / income) * 100 : 0)

  const buckets: BucketResult[] = []
  let otros: BucketResult | null = null

  for (const b of BENCHMARKS) {
    let items: AnalysisItem[] = []
    let monthly = 0

    if (b.key === 'tarjetas') {
      items = input.tarjetasItems
      monthly = input.tarjetasMonthly
    } else if (b.key === 'ahorro') {
      monthly = input.ahorroMonthly
      items = monthly > 0 ? [{ concept: 'Abonos a proyectos (prom. 3 meses)', monthly }] : []
    } else if (b.key === 'diversion') {
      // Diversión usa el gasto real del módulo, no un fijo
      monthly = input.diversionMonthly
        + input.fijos.filter(f => f.category === 'diversion').reduce((s, f) => s + f.monthly, 0)
      items = [
        ...(input.diversionMonthly > 0 ? [{ concept: 'Diversión (prom. 3 meses, tu parte)', monthly: input.diversionMonthly }] : []),
        ...input.fijos.filter(f => f.category === 'diversion').map(f => ({ concept: f.concept, monthly: f.monthly })),
      ]
    } else {
      const mine = input.fijos.filter(f => b.categories.includes(f.category))
      items = mine.map(f => ({ concept: f.concept, monthly: f.monthly })).sort((a, c) => c.monthly - a.monthly)
      monthly = mine.reduce((s, f) => s + f.monthly, 0)
    }

    monthly = r2(monthly)
    const pct = pctOf(monthly)
    let status: BucketStatus
    if (b.floor) {
      status = pct >= b.cap ? 'ok' : pct >= b.cap / 2 ? 'warn' : 'over'
    } else {
      status = pct <= b.cap ? 'ok' : pct <= b.cap * 1.15 ? 'warn' : 'over'
    }

    buckets.push({
      key: b.key, label: b.label, monthly, pct, cap: b.cap,
      floor: !!b.floor, status, why: b.why, items,
    })
  }

  // "Otros": sin benchmark, solo informativo
  const otrosFijos = input.fijos.filter(f =>
    !BENCHMARKS.some(b => b.categories.includes(f.category)) && f.category !== 'diversion')
  if (otrosFijos.length) {
    const monthly = r2(otrosFijos.reduce((s, f) => s + f.monthly, 0))
    otros = {
      key: 'otros', label: 'Otros', monthly, pct: pctOf(monthly), cap: 0,
      floor: false, status: 'ok', why: 'Sin categoría asignada — clasifícalos en Gastos para un análisis más fino.',
      items: otrosFijos.map(f => ({ concept: f.concept, monthly: f.monthly })).sort((a, c) => c.monthly - a.monthly),
    }
  }

  // Recomendaciones, la más grave primero
  const recommendations: Recommendation[] = []
  for (const bk of buckets) {
    if (bk.floor) {
      if (bk.status !== 'ok') {
        recommendations.push({
          severity: bk.status === 'over' ? 'over' : 'warn',
          title: `Ahorro por debajo del mínimo recomendado`,
          detail: `Se recomienda destinar al menos ${bk.cap}% de tu ingreso (${fmtPct(bk.cap, income)}) a ahorro o metas. Hoy destinas ${bk.pct.toFixed(1)}%. Considera apartar un monto fijo cada quincena hacia Proyectos.`,
        })
      }
      continue
    }
    if (bk.status === 'ok' || bk.monthly === 0) continue
    const top = bk.items.slice(0, 3).map(i => `${i.concept} (${fmtMoney(i.monthly)}/mes)`).join(', ')
    recommendations.push({
      severity: bk.status,
      title: `${bk.label}: ${bk.pct.toFixed(1)}% — recomendado máx ${bk.cap}%`,
      detail: `Estás gastando ${fmtMoney(bk.monthly)}/mes; el tope sugerido para tu ingreso es ${fmtPct(bk.cap, income)}. ${top ? `Candidatos a revisar: ${top}.` : ''}`,
    })
  }

  const committedMonthly = r2(
    buckets.filter(b => b.key !== 'ahorro').reduce((s, b) => s + b.monthly, 0)
    + (otros?.monthly ?? 0)
  )
  const committedPct = pctOf(committedMonthly)
  if (committedPct > 90) {
    recommendations.push({
      severity: 'over',
      title: `Tu gasto comprometido es ${committedPct.toFixed(0)}% del ingreso`,
      detail: `Queda muy poco margen para imprevistos (${fmtMoney(income - committedMonthly)}/mes libre). Prioriza recortar las categorías en rojo antes de asumir nuevos pagos fijos o MSI.`,
    })
  }

  const sevOrder = { over: 0, warn: 1, info: 2 }
  recommendations.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity])

  return {
    buckets, otros, recommendations,
    committedMonthly, committedPct,
    freeMonthly: r2(income - committedMonthly),
  }
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
}
function fmtPct(cap: number, income: number): string {
  return fmtMoney((cap / 100) * income)
}
