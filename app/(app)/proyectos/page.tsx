export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Project } from '@/types/database'
import AddProjectForm from '@/components/proyectos/add-project-form'
import ProjectCard from '@/components/proyectos/project-card'
import ProjectsSummary from '@/components/proyectos/projects-summary'
import { PrivacyProvider, PrivacyToggle } from '@/components/proyectos/privacy-context'

export default async function ProyectosPage() {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  // RLS devuelve los propios + los compartidos
  const [{ data: projects }, { data: profiles }] = await Promise.all([
    supabase
      .from('projects')
      .select('*, project_payments(*)')
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase.from('profiles').select('id, display_name'),
  ]) as [
    { data: Project[] | null },
    { data: { id: string; display_name: string | null }[] | null },
  ]

  const namesById: Record<string, string> = {}
  for (const p of profiles ?? []) namesById[p.id] = p.display_name ?? '?'

  const paidOf = (p: Project) =>
    (p.project_payments ?? []).reduce((s, pay) => s + pay.amount, 0)

  const active    = (projects ?? []).filter(p => !p.is_completed && paidOf(p) < p.total_cost)
  const completed = (projects ?? []).filter(p => p.is_completed || paidOf(p) >= p.total_cost)

  const totalCosto    = active.reduce((s, p) => s + p.total_cost, 0)
  const totalAbonado  = active.reduce((s, p) => s + paidOf(p), 0)
  const totalRestante = totalCosto - totalAbonado
  const hasPrivate    = active.some(p => !p.is_shared)

  return (
    <PrivacyProvider>
    <div className="space-y-4 max-w-4xl">
      {/* Header — desktop */}
      <div className="hidden md:flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proyectos</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Metas a futuro — presupuesto, abonos y comprobantes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PrivacyToggle />
          <AddProjectForm />
        </div>
      </div>

      {/* Header — mobile */}
      <div className="flex items-center justify-end gap-2 md:hidden">
        <PrivacyToggle />
        <AddProjectForm />
      </div>

      {/* Resumen */}
      <ProjectsSummary
        activeCount={active.length}
        totalAbonado={totalAbonado}
        totalRestante={totalRestante}
        hasPrivate={hasPrivate}
      />

      {/* Proyectos activos */}
      <section className="space-y-3">
        {!active.length ? (
          <div className="card p-5">
            <p className="text-sm text-gray-400">
              Sin proyectos activos. Crea uno con &quot;Nuevo proyecto&quot;.
            </p>
          </div>
        ) : (
          active.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              currentUserId={session.user.id}
              namesById={namesById}
            />
          ))
        )}
      </section>

      {/* Proyectos completados */}
      {completed.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-gray-500 text-sm px-1">Completados</h2>
          <div className="space-y-3 opacity-70">
            {completed.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                completed
                currentUserId={session.user.id}
                namesById={namesById}
              />
            ))}
          </div>
        </section>
      )}
    </div>
    </PrivacyProvider>
  )
}
