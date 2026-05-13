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

export interface LinkedDebt {
  debtId: string
  concept: string
  amount: number
  debtorName: string
}

interface Props {
  cardId: string
  cardName: string
  items: Item[]
  periodId: string
  linkedDebts?: LinkedDebt[]
}

export default function CollapsibleCardGroup({ cardId, cardName, items, periodId, linkedDebts = [] }: Props) {
  const [open, setOpen] = useState(false)
  const myTotal    = items.reduce((s, i) => s + i.amount, 0)
  const debtTotal  = linkedDebts.reduce((s, d) => s + d.amount, 0)
  const grandTotal = myTotal + debtTotal

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <div className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 flex-1 text-left min-w-0"
        >
          {open
            ? <ChevronDown size={13} className="text-gray-400 shrink-0" />
            : <ChevronRight size={13} className="text-gray-400 shrink-0" />
          }
          <span className="text-xs font-semibold text-gray-600 truncate">{cardName}</span>
          {!open && (
            <span className="text-xs text-gray-400 shrink-0">
              · {items.length} item{items.length !== 1 ? 's' : ''} · {formatMXN(myTotal)}
              {linkedDebts.length > 0 && (
                <span className="text-orange-500"> + {formatMXN(debtTotal)}</span>
              )}
            </span>
          )}
        </button>
        <PayCardGroupButton
          periodId={periodId}
          cardName={cardName}
          items={items}
          totalAmount={myTotal}
        />
      </div>

      {open && (
        <>
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

          {linkedDebts.length > 0 && (
            <div className="border-t border-orange-100 bg-orange-50/50 px-3 py-2 space-y-1.5">
              <p className="text-[10px] font-semibold text-orange-500 uppercase tracking-wide">Deudas en esta tarjeta</p>
              {linkedDebts.map(d => (
                <div key={d.debtId} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-700 truncate">{d.concept}</p>
                    <p className="text-[10px] text-orange-500">{d.debtorName} debe</p>
                  </div>
                  <span className="text-xs font-semibold text-orange-600 shrink-0">{formatMXN(d.amount)}</span>
                </div>
              ))}
              <div className="border-t border-orange-200 pt-1.5 flex justify-between text-xs font-bold text-gray-700">
                <span>Total {cardName}</span>
                <div className="text-right">
                  <span>{formatMXN(grandTotal)}</span>
                  <p className="text-[10px] font-normal text-gray-400">
                    Yo {formatMXN(myTotal)} · {linkedDebts.map(d => d.debtorName).join(', ')} {formatMXN(debtTotal)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
