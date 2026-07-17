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

// ── Regla 50/30/20: tres bloques que suman exactamente 100% del ingreso ─────

export interface GroupConfig {
  key: 'necesidades' | 'deseos' | 'ahorro_deudas'
  label: string
  cap: number
  categories: ExpenseCategory[]
  why: string
}

export const GROUPS: GroupConfig[] = [
  {
    key: 'necesidades', label: 'Necesidades', cap: 50,
    categories: ['vivienda', 'servicios', 'alimentacion', 'transporte', 'salud', 'mascotas', 'hogar'],
    why: 'Gastos obligatorios para vivir: vivienda, servicios, despensa, transporte, salud y los seres a tu cargo.',
  },
  {
    key: 'deseos', label: 'Deseos', cap: 30,
    categories: ['suscripciones', 'ropa', 'diversion', 'otros'],
    why: 'Estilo de vida: salidas, streaming, ropa y pasatiempos. Es lo primero recortable en una emergencia.',
  },
  {
    key: 'ahorro_deudas', label: 'Ahorro y deudas', cap: 20,
    categories: [],
    why: 'Pagarte a ti primero y reducir lo que debes: fondo de emergencia, metas y pagos a crédito (MSI).',
  },
]

// Dentro del 20%: si solo los MSI ya rebasan esto, estás sobre-financiado
export const MSI_CAP = 15
// Piso de ahorro deseable dentro del bloque del 20%
export const AHORRO_FLOOR = 10

// ── Motor de análisis ────────────────────────────────────────────────────────

export interface AnalysisItem { concept: string; monthly: number }

export interface AnalysisInput {
  monthlyIncome: number
  // Gastos fijos mensualizados (mi parte), con su categoría
  fijos: { concept: string; monthly: number; category: string }[]
  // Compras de tarjeta a UNA exhibición: promedio mensual de cuotas (últimos 3 meses)
  variables: { concept: string; monthly: number; category: string }[]
  diversionMonthly: number     // promedio mensual real del módulo (mi parte)
  ahorroMonthly: number        // promedio mensual de abonos a proyectos
  // Obligaciones: carga mensual actual de compras a meses (MSI)
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

export interface GroupResult {
  key: string
  label: string
  cap: number
  monthly: number
  pct: number
  status: BucketStatus
  why: string
  rows: BucketResult[]   // desglose por categoría (informativo, sin tope propio)
}

export interface Recommendation {
  severity: 'over' | 'warn' | 'info'
  title: string
  detail: string
}

export interface AnalysisResult {
  groups: GroupResult[]
  recommendations: Recommendation[]
  committedMonthly: number     // necesidades + deseos + MSI
  committedPct: number
  freeMonthly: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function analyzeFinances(input: AnalysisInput): AnalysisResult {
  const income = input.monthlyIncome
  const pctOf = (n: number) => (income > 0 ? (n / income) * 100 : 0)
  const capStatus = (pct: number, cap: number): BucketStatus =>
    pct <= cap ? 'ok' : pct <= cap * 1.15 ? 'warn' : 'over'

  const allSpend = [...input.fijos, ...input.variables]

  const infoRow = (key: string, label: string, monthly: number, items: AnalysisItem[], why = ''): BucketResult => ({
    key, label, monthly: r2(monthly), pct: pctOf(monthly), cap: 0,
    floor: false, status: 'ok', why, items,
  })

  const groups: GroupResult[] = GROUPS.map(g => {
    let rows: BucketResult[] = []

    if (g.key === 'ahorro_deudas') {
      rows = [
        infoRow('msi', 'Pagos a MSI (deudas)', input.msiMonthly, input.msiItems,
          'Carga mensual de tus compras a meses.'),
        infoRow('ahorro', 'Ahorro y proyectos', input.ahorroMonthly,
          input.ahorroMonthly > 0 ? [{ concept: 'Abonos a proyectos (prom. 3 meses)', monthly: input.ahorroMonthly }] : [],
          'Promedio mensual de tus abonos a metas.'),
      ]
    } else {
      for (const cat of g.categories) {
        if (cat === 'diversion') {
          // El fijo "Diversión" es el APORTE al presupuesto y el módulo registra el
          // gasto real de ese mismo dinero — se toma el mayor, no la suma
          const tagged = allSpend.filter(f => f.category === 'diversion')
          const aporte = tagged.reduce((s, f) => s + f.monthly, 0)
          const monthly = Math.max(input.diversionMonthly, aporte)
          if (monthly < 0.01) continue
          rows.push(infoRow(cat, CATEGORY_LABELS[cat], monthly, [
            ...(input.diversionMonthly > 0 ? [{ concept: 'Gasto real del módulo (prom. 3 meses, tu parte)', monthly: input.diversionMonthly }] : []),
            ...tagged.map(f => ({ concept: `${f.concept} (aporte al presupuesto)`, monthly: f.monthly })),
          ]))
          continue
        }
        const mine = allSpend.filter(f => f.category === cat)
        if (!mine.length) continue
        rows.push(infoRow(cat, CATEGORY_LABELS[cat],
          mine.reduce((s, f) => s + f.monthly, 0),
          mine.map(f => ({ concept: f.concept, monthly: f.monthly })).sort((a, b) => b.monthly - a.monthly)))
      }
      rows.sort((a, b) => b.monthly - a.monthly)
    }

    const monthly = r2(rows.reduce((s, r) => s + r.monthly, 0))
    const pct = pctOf(monthly)
    return {
      key: g.key, label: g.label, cap: g.cap, monthly, pct,
      status: capStatus(pct, g.cap), why: g.why, rows,
    }
  })

  // ── Recomendaciones, la más grave primero ──
  const recommendations: Recommendation[] = []
  const [nec, des, ahd] = groups

  for (const g of [nec, des]) {
    if (g.status === 'ok' || g.monthly === 0) continue
    const top = g.rows.flatMap(r => r.items).sort((a, b) => b.monthly - a.monthly).slice(0, 3)
      .map(i => `${i.concept} (${fmtMoney(i.monthly)}/mes)`).join(', ')
    recommendations.push({
      severity: g.status,
      title: `${g.label}: ${g.pct.toFixed(1)}% — recomendado máx ${g.cap}%`,
      detail: `Estás gastando ${fmtMoney(g.monthly)}/mes; el tope sugerido es ${fmtMoney((g.cap / 100) * income)}. Candidatos a revisar: ${top}.`,
    })
  }

  const msiPct = pctOf(input.msiMonthly)
  if (ahd.status !== 'ok') {
    recommendations.push({
      severity: ahd.status,
      title: `Ahorro y deudas: ${ahd.pct.toFixed(1)}% — recomendado máx ${ahd.cap}%`,
      detail: msiPct > AHORRO_FLOOR
        ? `El bloque se excede y son sobre todo deudas (MSI: ${fmtMoney(input.msiMonthly)}/mes). Evita nuevos MSI hasta liquidar los actuales.`
        : `El bloque del 20% está excedido. Revisa el balance entre abonos a deudas y ahorro.`,
    })
  }
  if (msiPct > MSI_CAP) {
    const top = input.msiItems.slice(0, 3).map(i => `${i.concept} (${fmtMoney(i.monthly)}/mes)`).join(', ')
    recommendations.push({
      severity: msiPct > MSI_CAP * 1.15 ? 'over' : 'warn',
      title: `Sobre-financiamiento: pagas ${fmtMoney(input.msiMonthly)}/mes a MSI (${msiPct.toFixed(1)}%)`,
      detail: `Solo tus compras a meses ya rebasan el ${MSI_CAP}% del ingreso — casi todo tu bloque de ahorro y deudas. No contrates nuevos MSI hasta liquidar${top ? `: ${top}` : ''}.`,
    })
  }

  const ahorroPct = pctOf(input.ahorroMonthly)
  if (income > 0 && ahorroPct < AHORRO_FLOOR) {
    recommendations.push({
      severity: ahorroPct < AHORRO_FLOOR / 2 ? 'over' : 'warn',
      title: 'Ahorro por debajo del mínimo recomendado',
      detail: `Del bloque de 20% para ahorro y deudas, se recomienda que al menos ${AHORRO_FLOOR}% del ingreso (${fmtMoney((AHORRO_FLOOR / 100) * income)}) sea ahorro. Hoy ahorras ${ahorroPct.toFixed(1)}%. Considera apartar un monto fijo cada quincena hacia Proyectos.`,
    })
  }

  // Mascotas recurrente y alto → fondo dedicado
  const mascotas = nec.rows.find(r => r.key === 'mascotas')
  if (mascotas && income > 0 && mascotas.pct >= 1.5) {
    recommendations.push({
      severity: 'info',
      title: `Gastas ${fmtMoney(mascotas.monthly)}/mes en tus mascotas (${mascotas.pct.toFixed(1)}%)`,
      detail: `Es un gasto recurrente con picos (veterinario, tratamientos). Crea un proyecto "Fondo veterinario" y aparta ${fmtMoney(Math.ceil(mascotas.monthly / 100) * 100)}/mes — así un gasto grande del vet no descuadra tu quincena.`,
    })
  }

  const committedMonthly = r2(nec.monthly + des.monthly + input.msiMonthly)
  const committedPct = pctOf(committedMonthly)
  if (committedPct > 90) {
    recommendations.push({
      severity: 'over',
      title: `Tu gasto comprometido es ${committedPct.toFixed(0)}% del ingreso`,
      detail: `Queda muy poco margen para imprevistos (${fmtMoney(income - committedMonthly)}/mes libre). Prioriza recortar los bloques en rojo antes de asumir nuevos pagos fijos o MSI.`,
    })
  }

  const sevOrder = { over: 0, warn: 1, info: 2 }
  recommendations.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity])

  return {
    groups, recommendations,
    committedMonthly, committedPct,
    freeMonthly: r2(income - committedMonthly),
  }
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
}
