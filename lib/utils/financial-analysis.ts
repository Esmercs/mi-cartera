import type { ExpenseCategory, IntervalType } from '@/types/database'

// ── Categorías ──────────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  vivienda:      'Vivienda',
  servicios:     'Servicios',
  alimentacion:  'Alimentación',
  transporte:    'Transporte',
  suscripciones: 'Suscripciones',
  salud:         'Salud',
  mascotas:      'Mascotas',
  ropa:          'Ropa',
  hogar:         'Hogar',
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
    key: 'mascotas', label: 'Mascotas', cap: 5,
    categories: ['mascotas'],
    why: 'Croquetas, veterinario y accesorios; arriba del 5% conviene un fondo dedicado para absorber los picos.',
  },
  {
    key: 'ropa', label: 'Ropa', cap: 5,
    categories: ['ropa'],
    why: 'Ropa y calzado se recomienda mantenerlos alrededor del 5% del ingreso.',
  },
  {
    key: 'hogar', label: 'Hogar', cap: 5,
    categories: ['hogar'],
    why: 'Artículos de limpieza y mantenimiento de la casa.',
  },
  {
    key: 'diversion', label: 'Diversión', cap: 10,
    categories: ['diversion'],
    why: 'El ocio es necesario, pero se recomienda contenerlo en 10% del ingreso.',
  },
  {
    key: 'ahorro', label: 'Ahorro y proyectos', cap: 10, floor: true,
    categories: [],
    why: 'Destinar al menos 10% del ingreso a ahorro o metas te da colchón ante imprevistos.',
  },
]

// Tope específico de financiamiento: carga mensual de MSI sobre el ingreso
export const MSI_CAP = 15

// ── Motor de análisis ────────────────────────────────────────────────────────

export interface AnalysisItem { concept: string; monthly: number }

export interface AnalysisInput {
  monthlyIncome: number
  // Gastos fijos mensualizados (mi parte), con su categoría
  fijos: { concept: string; monthly: number; category: string }[]
  // Gastos de tarjeta: promedio mensual de cuotas (últimos 3 meses), con su categoría
  variables: { concept: string; monthly: number; category: string }[]
  diversionMonthly: number     // promedio mensual real (mi parte)
  ahorroMonthly: number        // promedio mensual de abonos a proyectos
  // Financiamiento: carga mensual actual de gastos a meses (MSI)
  msiMonthly: number
  msiItems: AnalysisItem[]
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
  msi: BucketResult            // indicador transversal: sus cuotas ya viven en las categorías
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

  // Fijos + gasto variable de tarjetas, ambos con categoría
  const allSpend = [...input.fijos, ...input.variables]

  for (const b of BENCHMARKS) {
    let items: AnalysisItem[] = []
    let monthly = 0

    if (b.key === 'ahorro') {
      monthly = input.ahorroMonthly
      items = monthly > 0 ? [{ concept: 'Abonos a proyectos (prom. 3 meses)', monthly }] : []
    } else if (b.key === 'diversion') {
      // Diversión usa el gasto real del módulo además de fijos/extras etiquetados
      const tagged = allSpend.filter(f => f.category === 'diversion')
      monthly = input.diversionMonthly + tagged.reduce((s, f) => s + f.monthly, 0)
      items = [
        ...(input.diversionMonthly > 0 ? [{ concept: 'Diversión (prom. 3 meses, tu parte)', monthly: input.diversionMonthly }] : []),
        ...tagged.map(f => ({ concept: f.concept, monthly: f.monthly })),
      ]
    } else {
      const mine = allSpend.filter(f => b.categories.includes(f.category))
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
  const otrosSpend = allSpend.filter(f =>
    !BENCHMARKS.some(b => b.categories.includes(f.category)) && f.category !== 'diversion')
  if (otrosSpend.length) {
    const monthly = r2(otrosSpend.reduce((s, f) => s + f.monthly, 0))
    otros = {
      key: 'otros', label: 'Otros', monthly, pct: pctOf(monthly), cap: 0,
      floor: false, status: 'ok', why: 'Sin categoría asignada — clasifícalos en Gastos o Tarjetas para un análisis más fino.',
      items: otrosSpend.map(f => ({ concept: f.concept, monthly: f.monthly })).sort((a, c) => c.monthly - a.monthly),
    }
  }

  // Indicador transversal de financiamiento (MSI): sus cuotas ya están dentro
  // de las categorías, aquí se mide la carga total de compras a meses
  const msiPct = pctOf(input.msiMonthly)
  const msi: BucketResult = {
    key: 'msi', label: 'Financiamiento (MSI)',
    monthly: r2(input.msiMonthly), pct: msiPct, cap: MSI_CAP, floor: false,
    status: msiPct <= MSI_CAP ? 'ok' : msiPct <= MSI_CAP * 1.15 ? 'warn' : 'over',
    why: 'Carga mensual de todas tus compras a meses. Arriba del 15% del ingreso, cada quincena nueva nace comprometida.',
    items: input.msiItems,
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

  // MSI sobregirado → recomendación específica de financiamiento
  if (msi.status !== 'ok') {
    const top = msi.items.slice(0, 3).map(i => `${i.concept} (${fmtMoney(i.monthly)}/mes)`).join(', ')
    recommendations.push({
      severity: msi.status,
      title: `Financiamiento: pagas ${fmtMoney(msi.monthly)}/mes a MSI (${msi.pct.toFixed(1)}%) — recomendado máx ${MSI_CAP}%`,
      detail: `Estás sobregastando en compras a meses. Evita contratar nuevos MSI hasta liquidar los actuales${top ? `: ${top}` : ''}.`,
    })
  }

  // Rubro mascotas recurrente y alto → fondo dedicado
  const mascotas = buckets.find(b => b.key === 'mascotas')
  if (mascotas && income > 0 && mascotas.pct >= 1.5) {
    recommendations.push({
      severity: 'info',
      title: `Gastas ${fmtMoney(mascotas.monthly)}/mes en tus mascotas (${mascotas.pct.toFixed(1)}%)`,
      detail: `Es un gasto recurrente con picos (veterinario, tratamientos). Crea un proyecto "Fondo veterinario" y aparta ${fmtMoney(Math.ceil(mascotas.monthly / 100) * 100)}/mes — así un gasto grande del vet no descuadra tu quincena.`,
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
    buckets, otros, msi, recommendations,
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
