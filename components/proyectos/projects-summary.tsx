'use client'
import { formatMXN } from '@/lib/utils/currency'
import { usePrivacy, MASKED } from './privacy-context'

interface ProjectsSummaryProps {
  activeCount: number
  totalAbonado: number
  totalRestante: number
  hasPrivate: boolean
}

export default function ProjectsSummary({
  activeCount,
  totalAbonado,
  totalRestante,
  hasPrivate,
}: ProjectsSummaryProps) {
  const { hidden } = usePrivacy()
  const mask = hidden && hasPrivate

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="card p-3 md:p-4 bg-blue-50">
        <p className="text-xs text-blue-600 font-medium">Activos</p>
        <p className="text-xl md:text-2xl font-bold text-blue-800 mt-1">{activeCount}</p>
      </div>
      <div className="card p-3 md:p-4 bg-green-50">
        <p className="text-xs text-green-600 font-medium truncate">Abonado</p>
        <p className="text-base md:text-xl font-bold text-green-800 mt-1">
          {mask ? MASKED : formatMXN(totalAbonado)}
        </p>
      </div>
      <div className="card p-3 md:p-4 bg-orange-50">
        <p className="text-xs text-orange-600 font-medium truncate">Por pagar</p>
        <p className="text-base md:text-xl font-bold text-orange-800 mt-1">
          {mask ? MASKED : formatMXN(totalRestante)}
        </p>
      </div>
    </div>
  )
}
