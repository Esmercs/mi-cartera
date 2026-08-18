'use client'
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { formatMXN } from '@/lib/utils/currency'
import { formatShortDate } from '@/lib/utils/date-utils'

export interface CreditRowData {
  id: string
  name: string
  principal: number        // monto original completo
  myBalance: number        // MI parte de lo que falta por pagar — el número que manda
  fullBalance: number      // lo que se le debe al banco, completo
  otherBalance: number     // parte del otro en el saldo; > 0 solo si yo desembolso
  paidPct: number          // % del principal ya liquidado (se calcula sobre los totales)
  myPayment: number        // mi parte de la cuota
  otherPayment: number     // parte del otro; > 0 solo si yo desembolso
  monthlyPayment: number   // cuota completa al banco
  annualRate: number
  paymentDay: 15 | 30
  monthInterest: number    // interés devengado del mes en curso
  payoffMonths: number
  payoffDate: string | null
  remainingInterest: number
  neverPaysOff: boolean
  movements: { id: string; kind: string; amount: number; date: string }[]
}

const KIND_LABEL: Record<string, string> = {
  disbursement: 'Monto original',
  interest:     'Interés del mes',
  payment:      'Abono',
}

export default function CreditRow({
  credit, otherName, children,
}: {
  credit: CreditRowData
  otherName: string
  children?: React.ReactNode   // botones de acción (abono, editar, borrar, recalcular)
}) {
  const [open, setOpen] = useState(false)
  // paidPct llega ya calculado sobre los totales. Calcularlo aquí con myBalance
  // contra el principal completo daría un avance falso.
  const paidPct = credit.paidPct
  const isShared = credit.otherBalance > 0

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 gap-2">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 flex-1 text-left min-w-0">
          {open
            ? <ChevronDown size={14} className="text-gray-400 shrink-0" />
            : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">{credit.name}</p>
            <p className="text-xs text-gray-400">
              cuota {formatMXN(credit.monthlyPayment)} · día {credit.paymentDay}
              {credit.annualRate > 0 && ` · ${credit.annualRate}% anual`}
              {credit.otherPayment > 0 && (
                <span className="text-green-600"> · + {formatMXN(credit.otherPayment)} de {otherName}</span>
              )}
            </p>
          </div>
        </button>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-red-600">{formatMXN(credit.myBalance)}</p>
          <p className="text-[10px] text-gray-400">
            {isShared ? <>de {formatMXN(credit.fullBalance)} · </> : null}{paidPct}% liquidado
          </p>
        </div>
      </div>

      <div className="px-3 pb-2">
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 rounded-full" style={{ width: `${paidPct}%` }} />
        </div>
      </div>

      {open && (
        <div className="border-t border-gray-100 px-3 py-2.5 space-y-2">
          <div className="space-y-1">
            {isShared && (
              <>
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Saldo con el banco</span>
                  <span>{formatMXN(credit.fullBalance)}</span>
                </div>
                <div className="flex justify-between text-xs font-semibold text-gray-600">
                  <span>Mi parte del saldo</span>
                  <span>{formatMXN(credit.myBalance)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Parte de {otherName}</span>
                  <span>{formatMXN(credit.otherBalance)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-xs text-gray-500">
              <span>Interés devengado este mes{isShared ? ' (completo)' : ''}</span>
              <span>{formatMXN(credit.monthInterest)}</span>
            </div>
            <div className="flex justify-between text-xs font-semibold text-gray-600">
              <span>Mi parte de la cuota</span>
              <span>{formatMXN(credit.myPayment)}</span>
            </div>
            {credit.otherPayment > 0 && (
              <div className="flex justify-between text-xs font-semibold text-green-700">
                <span>A recibir de {otherName}</span>
                <span>{formatMXN(credit.otherPayment)}</span>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-gray-50 px-2.5 py-2">
            {credit.neverPaysOff ? (
              <p className="text-xs text-amber-700">
                Con esta cuota la deuda no baja: el interés del mes
                ({formatMXN(credit.monthInterest)}) alcanza o supera el abono.
              </p>
            ) : (
              <p className="text-xs text-gray-500">
                Te quedan <span className="font-semibold text-gray-700">{credit.payoffMonths} meses</span>
                {credit.payoffDate && <> · liquidas en {formatShortDate(credit.payoffDate)}</>}
                <span className="block text-[10px] text-gray-400 mt-0.5">
                  Interés por pagar: {formatMXN(credit.remainingInterest)}. Si abonas de más, la
                  cuota no cambia — se acorta el plazo.
                </span>
              </p>
            )}
          </div>

          {credit.movements.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Movimientos</p>
              <div className="space-y-0.5">
                {credit.movements.map(m => (
                  <div key={m.id} className="flex justify-between text-xs">
                    <span className="text-gray-500">
                      {KIND_LABEL[m.kind] ?? m.kind}
                      <span className="text-gray-300 ml-1">{formatShortDate(m.date)}</span>
                    </span>
                    <span className={m.kind === 'payment' ? 'text-green-600' : 'text-gray-600'}>
                      {m.kind === 'payment' ? '−' : '+'}{formatMXN(m.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {children && <div className="flex flex-wrap gap-2 pt-1">{children}</div>}
        </div>
      )}
    </div>
  )
}
