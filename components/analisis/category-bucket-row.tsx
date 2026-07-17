'use client'
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { formatMXN } from '@/lib/utils/currency'
import type { BucketResult } from '@/lib/utils/financial-analysis'

const STATUS_COLORS = {
  ok:   { bar: 'bg-green-500', text: 'text-green-600' },
  warn: { bar: 'bg-amber-400', text: 'text-amber-600' },
  over: { bar: 'bg-red-500',   text: 'text-red-600' },
}

export default function CategoryBucketRow({
  bucket,
  informational = false,
}: {
  bucket: BucketResult
  informational?: boolean
}) {
  const [open, setOpen] = useState(false)
  const colors = STATUS_COLORS[bucket.status]
  // Todas las barras comparten la misma escala: % del ingreso mensual.
  // Así se pueden "sumar" visualmente y cuadran con la fila de Total.
  const widthPct = Math.min(bucket.pct, 100)
  const capMark = !informational && bucket.cap > 0 ? Math.min(bucket.cap, 100) : null

  return (
    <div className="py-2 border-b last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left"
        title={bucket.why}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 min-w-0">
            {open
              ? <ChevronDown size={12} className="text-gray-300 shrink-0" />
              : <ChevronRight size={12} className="text-gray-300 shrink-0" />}
            <span className="text-sm text-gray-800 truncate">{bucket.label}</span>
          </span>
          <span className="text-xs shrink-0">
            <span className={`font-bold ${colors.text}`}>{bucket.pct.toFixed(1)}%</span>
            {!informational && (
              <span className="text-gray-400"> / {bucket.floor ? 'mín' : 'máx'} {bucket.cap}%</span>
            )}
            <span className="text-gray-500 font-medium ml-2">{formatMXN(bucket.monthly)}/mes</span>
          </span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-1.5 relative">
          <div
            className={`h-full rounded-full ${colors.bar}`}
            style={{ width: `${widthPct}%` }}
          />
          {capMark !== null && (
            // Tope/piso recomendado, en la misma escala (% del ingreso)
            <div className="absolute top-0 bottom-0 w-0.5 bg-gray-400/60" style={{ left: `${capMark}%` }} />
          )}
        </div>
      </button>

      {open && (
        <div className="mt-2 ml-5 space-y-1">
          {bucket.items.length === 0 ? (
            <p className="text-xs text-gray-400">Sin gastos en esta categoría.</p>
          ) : (
            bucket.items.map((item, i) => (
              <div key={i} className="flex justify-between text-xs text-gray-500">
                <span className="truncate mr-2">{item.concept}</span>
                <span className="shrink-0">{formatMXN(item.monthly)}/mes</span>
              </div>
            ))
          )}
          <p className="text-[10px] text-gray-300 pt-1">{bucket.why}</p>
        </div>
      )}
    </div>
  )
}
