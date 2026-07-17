'use client'
import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { formatMXN } from '@/lib/utils/currency'
import { formatMXDate, paydayForPeriodEnd } from '@/lib/utils/date-utils'
import PayInstallmentButton from './pay-installment-button'
import DeleteExpenseButton from './delete-expense-button'
import EditExpenseButton from './edit-expense-button'
import MarkDebtPaidButton from '@/components/shared/mark-debt-paid-button'

export interface ExpenseRow {
  id: string
  concept: string
  cardId: string | null
  category?: string
  months: number
  totalAmount: number
  remaining: number
  paidCount: number
  isShared: boolean
  sharedPct: number | null
  expenseType: 'compra' | 'ajuste'
  isDomiciliado: boolean
  mine: boolean
  overdue: boolean
  interPersonDebtId: string | null
  hasPaidInstallments: boolean
  nextInstallment: { id: string; amount: number; due: string | null } | null
}

export interface ReceivableRow {
  id: string
  concept: string
  debtorName: string
  pending: number
  cuotasLabel: string | null
  totalInstallments: number | null
  paidInstallments: number
  dueDate: string | null
  amount: number
}

interface Props {
  cardName: string
  balance: number
  creditLimit: number
  expenses: ExpenseRow[]
  partnerName: string
  receivables?: ReceivableRow[]   // deudas entre personas cargadas a esta tarjeta
  headerActions?: ReactNode   // AdjustBalanceForm + DeleteCardButton (server-rendered)
}

export default function CardExpensesGroup({
  cardName, balance, creditLimit, expenses, partnerName, receivables = [], headerActions,
}: Props) {
  const [open, setOpen] = useState(false)
  const usedPct = creditLimit > 0 ? Math.round((balance / creditLimit) * 100) : null
  const compras = expenses.filter(e => e.expenseType === 'compra')
  const ajustes = expenses.filter(e => e.expenseType === 'ajuste')

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          {open
            ? <ChevronDown size={14} className="text-gray-400 shrink-0" />
            : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
          <span className="text-sm font-semibold text-gray-700 truncate">{cardName}</span>
          <span className="text-xs text-gray-400 shrink-0">
            · {expenses.length + receivables.length} movimiento{expenses.length + receivables.length !== 1 ? 's' : ''}
          </span>
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-sm font-bold ${balance > 0 ? 'text-red-600' : balance < 0 ? 'text-orange-500' : 'text-gray-400'}`}>
            {formatMXN(balance)}
          </span>
          {headerActions}
        </div>
      </div>

      {usedPct !== null && (
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 space-y-1">
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                usedPct >= 80 ? 'bg-red-500' : usedPct >= 50 ? 'bg-orange-400' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(Math.max(usedPct, 0), 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-400 text-right">
            {usedPct}% de {formatMXN(creditLimit)}
          </p>
        </div>
      )}

      {balance < -0.005 && (
        <p className="px-4 py-1.5 text-xs text-orange-600 bg-orange-50">
          Saldo negativo: tienes ajustes sin resolver — revisa la sección de ajustes.
        </p>
      )}

      {open && (
        <div className="px-4 py-2 divide-y divide-gray-50">
          {expenses.length === 0 && receivables.length === 0 && (
            <p className="text-sm text-gray-400 py-2">Sin movimientos pendientes.</p>
          )}

          {compras.map(e => (
            <div key={e.id} className="py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">{e.concept}</p>
                  <p className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap mt-0.5">
                    {e.months > 1 && (
                      <span className="bg-purple-50 text-purple-600 px-1.5 rounded">
                        cuota {Math.min(e.paidCount + 1, e.months)}/{e.months}
                      </span>
                    )}
                    {e.isShared && (
                      <span className="bg-pink-50 text-pink-600 px-1.5 rounded">
                        {partnerName} {e.sharedPct?.toFixed(0)}%
                      </span>
                    )}
                    {e.isDomiciliado && (
                      <span className="bg-blue-50 text-blue-500 px-1.5 rounded">domiciliado</span>
                    )}
                    {e.nextInstallment?.due && (
                      <span className={e.overdue ? 'text-red-500 font-semibold' : ''}>
                        {e.overdue ? '⚠ ' : ''}Pago: {formatMXDate(paydayForPeriodEnd(e.nextInstallment.due))}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-800">{formatMXN(e.remaining)}</p>
                    {e.months > 1 && e.nextInstallment && (
                      <p className="text-xs text-gray-400">{formatMXN(e.nextInstallment.amount)}/mes</p>
                    )}
                  </div>
                  {e.mine && e.nextInstallment && (
                    <PayInstallmentButton
                      installmentId={e.nextInstallment.id}
                      concept={e.concept}
                      amount={e.nextInstallment.amount}
                      cuotaLabel={e.months > 1 ? `cuota ${Math.min(e.paidCount + 1, e.months)}/${e.months}` : null}
                    />
                  )}
                  {e.mine && (
                    <>
                      <EditExpenseButton
                        id={e.id}
                        concept={e.concept}
                        totalAmount={e.totalAmount}
                        months={e.months}
                        cardId={e.cardId}
                        interPersonDebtId={e.interPersonDebtId}
                        hasPaidInstallments={e.hasPaidInstallments}
                        nextDue={e.nextInstallment?.due ?? null}
                        category={e.category}
                      />
                      <DeleteExpenseButton
                        id={e.id}
                        concept={e.concept}
                        interPersonDebtId={e.interPersonDebtId}
                        hasPaidInstallments={e.hasPaidInstallments}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}

          {receivables.length > 0 && (
            <div className="py-2">
              <p className="text-[10px] font-semibold text-orange-500 uppercase tracking-wide mb-1">
                Deudas en esta tarjeta (te deben)
              </p>
              {receivables.map(r => (
                <div key={r.id} className="flex items-center justify-between py-2 gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">{r.concept}</p>
                    <p className="text-xs text-orange-500">
                      {r.debtorName} debe{r.cuotasLabel ? ` · ${r.cuotasLabel}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold text-orange-600">{formatMXN(r.pending)}</span>
                    <MarkDebtPaidButton
                      debtId={r.id}
                      totalInstallments={r.totalInstallments}
                      paidInstallments={r.paidInstallments}
                      dueDate={r.dueDate}
                      concept={r.concept}
                      amount={r.amount}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {ajustes.length > 0 && (
            <div className="py-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Ajustes</p>
              {ajustes.map(e => (
                <div key={e.id} className="flex items-center justify-between py-1.5 gap-2">
                  <p className="text-xs text-gray-500 truncate flex-1">{e.concept}</p>
                  <span className={`text-xs font-semibold shrink-0 ${e.remaining >= 0 ? 'text-gray-600' : 'text-green-600'}`}>
                    {formatMXN(e.remaining)}
                  </span>
                  {e.mine && (
                    <DeleteExpenseButton
                      id={e.id}
                      concept={e.concept}
                      interPersonDebtId={null}
                      hasPaidInstallments={e.hasPaidInstallments}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
