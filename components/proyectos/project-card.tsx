'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Loader2,
  Paperclip,
  Trash2,
  CalendarDays,
  CheckCircle2,
  Users,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatMXN } from '@/lib/utils/currency'
import { formatMXDate, isOverdue } from '@/lib/utils/date-utils'
import ConfirmDialog from '@/components/shared/confirm-dialog'
import type { Project, ProjectPayment } from '@/types/database'

interface ProjectCardProps {
  project: Project
  completed?: boolean
  currentUserId: string
  namesById: Record<string, string>
}

export default function ProjectCard({
  project,
  completed = false,
  currentUserId,
  namesById,
}: ProjectCardProps) {
  const router = useRouter()
  const supabase = createClient()

  const payments = [...(project.project_payments ?? [])]
    .sort((a, b) => a.paid_at.localeCompare(b.paid_at))

  const paid      = payments.reduce((s, p) => s + p.amount, 0)
  const remaining = Math.max(0, project.total_cost - paid)
  const pct       = project.total_cost > 0 ? Math.min(100, (paid / project.total_cost) * 100) : 0
  const overdue   = !completed && remaining > 0 && isOverdue(project.due_date)
  const isOwner   = project.owner_id === currentUserId

  const [expanded, setExpanded] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [payForm, setPayForm] = useState({ amount: '', paid_at: '', notes: '' })
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null)
  const [deletePayment, setDeletePayment] = useState<ProjectPayment | null>(null)
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function openAddPayment() {
    setPayForm({ amount: '', paid_at: new Date().toISOString().slice(0, 10), notes: '' })
    setReceiptFile(null)
    setError(null)
    setAddOpen(true)
  }

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()

    let receiptPath: string | null = null
    if (receiptFile) {
      const safeName = receiptFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${user!.id}/${project.id}/${Date.now()}_${safeName}`
      const { error: uploadError } = await supabase.storage
        .from('comprobantes')
        .upload(path, receiptFile)
      if (uploadError) {
        setError('No se pudo subir el comprobante: ' + uploadError.message)
        setSaving(false)
        return
      }
      receiptPath = path
    }

    const { error: insertError } = await supabase.from('project_payments').insert({
      project_id:   project.id,
      owner_id:     user!.id,
      amount:       parseFloat(payForm.amount),
      paid_at:      payForm.paid_at,
      receipt_path: receiptPath,
      notes:        payForm.notes || null,
    })

    if (insertError) {
      setError('No se pudo registrar el abono: ' + insertError.message)
      setSaving(false)
      return
    }

    setAddOpen(false)
    setSaving(false)
    router.refresh()
  }

  async function viewReceipt(payment: ProjectPayment) {
    if (!payment.receipt_path) return
    setViewingReceipt(payment.id)
    const { data } = await supabase.storage
      .from('comprobantes')
      .createSignedUrl(payment.receipt_path, 3600)
    setViewingReceipt(null)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function handleDeletePayment() {
    if (!deletePayment) return
    setDeleting(true)
    if (deletePayment.receipt_path) {
      await supabase.storage.from('comprobantes').remove([deletePayment.receipt_path])
    }
    await supabase.from('project_payments').delete().eq('id', deletePayment.id)
    setDeleting(false)
    setDeletePayment(null)
    router.refresh()
  }

  async function handleDeleteProject() {
    setDeleting(true)
    const paths = payments
      .map(p => p.receipt_path)
      .filter((p): p is string => !!p)
    if (paths.length) {
      await supabase.storage.from('comprobantes').remove(paths)
    }
    await supabase.from('projects').delete().eq('id', project.id)
    setDeleting(false)
    setDeleteProjectOpen(false)
    router.refresh()
  }

  return (
    <div className="card p-4 md:p-5 space-y-3">
      {/* Encabezado */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-800 truncate">{project.name}</h3>
            {project.is_shared && (
              <span className="flex items-center gap-1 text-[10px] font-medium bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded shrink-0">
                <Users size={10} /> Compartido
              </span>
            )}
            {(completed || remaining === 0) && (
              <CheckCircle2 size={16} className="text-green-600 shrink-0" />
            )}
          </div>
          {project.due_date && (
            <p className={`text-xs mt-0.5 flex items-center gap-1 ${overdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
              <CalendarDays size={12} />
              Límite: {formatMXDate(project.due_date)}{overdue && ' — vencido'}
            </p>
          )}
          {project.notes && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">{project.notes}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <p className="text-sm font-bold text-gray-800">{formatMXN(project.total_cost)}</p>
            <p className={`text-xs ${remaining === 0 ? 'text-green-600' : 'text-orange-600'} font-medium`}>
              {remaining === 0 ? 'Pagado' : `Faltan ${formatMXN(remaining)}`}
            </p>
          </div>
          {expanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </div>
      </button>

      {/* Barra de progreso */}
      <div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${remaining === 0 ? 'bg-green-500' : 'bg-brand-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-xs text-gray-400">
          <span>Abonado: <span className="text-green-600 font-medium">{formatMXN(paid)}</span></span>
          <span>{pct.toFixed(0)}%</span>
        </div>
      </div>

      {/* Detalle expandido */}
      {expanded && (
        <div className="pt-2 border-t space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Abonos ({payments.length})
            </h4>
            <div className="flex items-center gap-2">
              {!completed && remaining > 0 && (
                <button onClick={openAddPayment}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 flex items-center gap-1">
                  <Plus size={14} /> Registrar abono
                </button>
              )}
              {isOwner && (
                <button onClick={() => setDeleteProjectOpen(true)}
                  className="text-xs font-medium text-gray-400 hover:text-red-600 flex items-center gap-1">
                  <Trash2 size={14} /> Eliminar
                </button>
              )}
            </div>
          </div>

          {!payments.length ? (
            <p className="text-sm text-gray-400">Aún no hay abonos registrados.</p>
          ) : (
            <div className="space-y-1">
              {payments.map(payment => (
                <div key={payment.id}
                  className="flex items-center justify-between py-1.5 border-b last:border-0 text-sm gap-2">
                  <div className="min-w-0">
                    <span className="text-gray-700 font-medium">{formatMXN(payment.amount)}</span>
                    {project.is_shared && (
                      <span className="text-purple-600 ml-2 text-xs font-medium">
                        {namesById[payment.owner_id] ?? '?'}
                      </span>
                    )}
                    <span className="text-gray-400 ml-2 text-xs">{formatMXDate(payment.paid_at)}</span>
                    {payment.notes && (
                      <span className="text-gray-400 ml-2 text-xs truncate">· {payment.notes}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {payment.receipt_path && (
                      <button onClick={() => viewReceipt(payment)}
                        disabled={viewingReceipt === payment.id}
                        title="Ver comprobante"
                        className="text-brand-600 hover:text-brand-700 disabled:opacity-50">
                        {viewingReceipt === payment.id
                          ? <Loader2 size={15} className="animate-spin" />
                          : <Paperclip size={15} />}
                      </button>
                    )}
                    {payment.owner_id === currentUserId && (
                      <button onClick={() => setDeletePayment(payment)}
                        title="Eliminar abono"
                        className="text-gray-300 hover:text-red-600">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal registrar abono */}
      {addOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-gray-800">Registrar abono</h3>
            <p className="text-xs text-gray-400 -mt-2">
              {project.name} · faltan {formatMXN(remaining)}
            </p>
            <form onSubmit={handleAddPayment} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Cantidad</label>
                  <input className="input" type="number" step="0.01" min="0.01"
                    value={payForm.amount}
                    onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} required />
                </div>
                <div>
                  <label className="label">Fecha</label>
                  <input className="input" type="date" value={payForm.paid_at}
                    onChange={e => setPayForm(f => ({ ...f, paid_at: e.target.value }))} required />
                </div>
              </div>
              <div>
                <label className="label">Comprobante (opcional)</label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={e => setReceiptFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-500
                    file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0
                    file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700
                    hover:file:bg-brand-100"
                />
              </div>
              <div>
                <label className="label">Notas (opcional)</label>
                <input className="input" value={payForm.notes}
                  onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Primer abono, transferencia, etc." />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
                  {saving && <Loader2 size={14} className="animate-spin" />}{saving ? 'Guardando...' : 'Guardar'}
                </button>
                <button type="button" onClick={() => setAddOpen(false)} className="btn-ghost flex-1">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmar eliminar abono */}
      <ConfirmDialog
        open={!!deletePayment}
        title="Eliminar abono"
        message={deletePayment
          ? `Se eliminará el abono de ${formatMXN(deletePayment.amount)} del ${formatMXDate(deletePayment.paid_at)}${deletePayment.receipt_path ? ' junto con su comprobante' : ''}.`
          : undefined}
        confirmLabel="Eliminar"
        tone="danger"
        loading={deleting}
        onConfirm={handleDeletePayment}
        onCancel={() => setDeletePayment(null)}
      />

      {/* Confirmar eliminar proyecto */}
      <ConfirmDialog
        open={deleteProjectOpen}
        title="Eliminar proyecto"
        message={`Se eliminará "${project.name}" con sus ${payments.length} abono(s) y comprobantes. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar proyecto"
        tone="danger"
        loading={deleting}
        onConfirm={handleDeleteProject}
        onCancel={() => setDeleteProjectOpen(false)}
      />
    </div>
  )
}
