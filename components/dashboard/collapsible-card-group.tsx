'use client'
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { formatMXN } from '@/lib/utils/currency'
import PayCardGroupButton from './pay-card-group-button'

interface Item {
  key: string
  concept: string
  amount: number
  type: string
}

interface Props {
  cardId: string
  cardName: string
  items: Item[]
  periodId: string
}

export default function CollapsibleCardGroup({ cardId, cardName, items, periodId }: Props) {
  const [open, setOpen] = useState(false)
  const groupTotal = items.reduce((s, i) => s + i.amount, 0)

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <div className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 flex-1 text-left"
        >
          {open
            ? <ChevronDown size={13} className="text-gray-400" />
            : <ChevronRight size={13} className="text-gray-400" />
          }
          <span className="text-xs font-semibold text-gray-600">{cardName}</span>
          {!open && (
            <span className="text-xs text-gray-400">· {items.length} item{items.length !== 1 ? 's' : ''} · {formatMXN(groupTotal)}</span>
          )}
        </button>
        <PayCardGroupButton
          periodId={periodId}
          cardName={cardName}
          items={items}
          totalAmount={groupTotal}
        />
      </div>

      {open && (
        <div className="divide-y divide-gray-50 px-3">
          {items.map(item => (
            <div key={item.key} className="flex items-center justify-between py-2 gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-800 truncate">{item.concept}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  item.type === 'fijo' ? 'bg-blue-50 text-blue-600' :
                  item.type === 'msi'  ? 'bg-purple-50 text-purple-600' :
                  'bg-orange-50 text-orange-600'
                }`}>
                  {item.type === 'fijo' ? 'Fijo' : item.type === 'msi' ? 'MSI' : 'Programado'}
                </span>
              </div>
              <span className="text-sm font-semibold text-gray-700 shrink-0">{formatMXN(item.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
