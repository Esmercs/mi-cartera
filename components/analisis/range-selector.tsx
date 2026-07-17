'use client'
import { useRouter } from 'next/navigation'

export const RANGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'este-mes',  label: 'Este mes' },
  { value: 'mes-pasado', label: 'Mes pasado' },
  { value: '3m',  label: '3 meses' },
  { value: '6m',  label: '6 meses' },
  { value: '12m', label: '12 meses' },
]

export default function RangeSelector({ current }: { current: string }) {
  const router = useRouter()
  return (
    <div className="flex gap-1 flex-wrap">
      {RANGE_OPTIONS.map(o => (
        <button
          key={o.value}
          onClick={() => router.push(`/analisis?r=${o.value}`)}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            current === o.value
              ? 'bg-brand-600 text-white border-brand-600'
              : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
