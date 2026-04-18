import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/sidebar'
import BottomNav from '@/components/layout/bottom-nav'
import MobileHeader from '@/components/layout/mobile-header'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single()

  if (!profile || profile.status !== 'approved') redirect('/pending')

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar — solo desktop */}
      <div className="hidden md:block">
        <Sidebar profile={profile} />
      </div>

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header — solo móvil */}
        <MobileHeader profile={profile} />

        <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6 overflow-auto">
          {children}
        </main>
      </div>

      {/* Nav inferior — solo móvil */}
      <BottomNav />
    </div>
  )
}
