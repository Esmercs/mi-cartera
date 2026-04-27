export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase/server'
import type { Profile } from '@/types/database'
import { formatMXDate } from '@/lib/utils/date-utils'
import ApproveRejectButtons from '@/components/admin/approve-reject-buttons'

export default async function AccessRequestsPage() {
  const supabase = createServerClient()

  const { data: pending } = await supabase
    .from('profiles')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true }) as { data: Profile[] | null }

  const { data: approved } = await supabase
    .from('profiles')
    .select('*')
    .eq('status', 'approved')
    .order('created_at', { ascending: false }) as { data: Profile[] | null }

  const { data: rejected } = await supabase
    .from('profiles')
    .select('*')
    .eq('status', 'rejected')
    .order('updated_at', { ascending: false }) as { data: Profile[] | null }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Panel de Administrador</h1>
        <p className="text-gray-500 text-sm mt-0.5">Gestión de accesos a MiCapital</p>
      </div>

      {/* Pendientes */}
      <section className="card p-5 space-y-4">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          Solicitudes pendientes
          {(pending?.length ?? 0) > 0 && (
            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
              {pending!.length}
            </span>
          )}
        </h2>

        {!pending?.length ? (
          <p className="text-sm text-gray-400">No hay solicitudes pendientes.</p>
        ) : (
          <div className="space-y-3">
            {pending.map(user => (
              <div
                key={user.id}
                className="flex items-center justify-between p-4 border rounded-xl bg-amber-50 border-amber-200"
              >
                <div>
                  <p className="font-medium text-gray-800">
                    {user.full_name ?? user.email}
                    {user.display_name && (
                      <span className="text-gray-400 font-normal ml-2">
                        ({user.display_name})
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-gray-500">{user.email}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Registrado: {formatMXDate(user.created_at)}
                  </p>
                </div>
                <ApproveRejectButtons userId={user.id} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Aprobados */}
      <section className="card p-5 space-y-3">
        <h2 className="font-semibold text-gray-700 text-sm">
          Usuarios aprobados ({approved?.length ?? 0})
        </h2>
        {approved?.map(user => (
          <div key={user.id} className="flex items-center justify-between py-2 border-b last:border-0">
            <div>
              <p className="text-sm font-medium text-gray-800">
                {user.display_name ?? user.full_name}
                {user.role === 'admin' && (
                  <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                    Admin
                  </span>
                )}
              </p>
              <p className="text-xs text-gray-400">{user.email}</p>
            </div>
            <span className="text-xs text-green-600 font-medium">Aprobado</span>
          </div>
        ))}
      </section>

      {/* Rechazados */}
      {(rejected?.length ?? 0) > 0 && (
        <section className="card p-5 space-y-3">
          <h2 className="font-semibold text-gray-700 text-sm">
            Rechazados ({rejected!.length})
          </h2>
          {rejected!.map(user => (
            <div key={user.id} className="flex items-center justify-between py-2 border-b last:border-0 opacity-60">
              <div>
                <p className="text-sm text-gray-700">{user.full_name ?? user.email}</p>
                <p className="text-xs text-gray-400">{user.email}</p>
              </div>
              <ApproveRejectButtons userId={user.id} showApproveOnly />
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
