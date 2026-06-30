'use client'
import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  tone?: 'danger' | 'success'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
  /** Contenido extra entre el título y el mensaje (ej. concepto + monto) */
  children?: ReactNode
}

const toneClasses: Record<'danger' | 'success', string> = {
  danger:  'bg-red-600 hover:bg-red-700',
  success: 'bg-green-600 hover:bg-green-700',
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancelar',
  tone = 'success',
  loading = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={() => !loading && onCancel()}
    >
      <div className="card p-5 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-800">{title}</h3>

        {children}

        {message && <p className="text-sm text-gray-500">{message}</p>}

        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 flex items-center justify-center gap-1.5 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors disabled:opacity-50 ${toneClasses[tone]}`}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="btn-ghost flex-1"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
