'use client'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types/database'

const titles: Record<string, string> = {
  '/dashboard':      'Mi Dashboard',
  '/shared':         'Compartido',
  '/gastos-fijos':   'Gastos Fijos',
  '/financiamiento': 'Financiamiento',
  '/diversion':      'Diversión',
  '/deudas':         'Deudas',
  '/admin/requests': 'Admin',
}

export default function MobileHeader({ profile }: { profile: Profile }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const title = titles[pathname] ?? 'Mi Cartera'
  const isLalo = profile.display_name?.toLowerCase() === 'lalo'

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-30 bg-white border-b px-4 py-3 flex items-center justify-between md:hidden">
      <div className="flex items-center gap-2.5">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white
          ${isLalo ? 'bg-lalo' : 'bg-ale'}`}>
          {profile.display_name?.[0]?.toUpperCase() ?? '?'}
        </div>
        <span className="font-semibold text-gray-900 text-base">{title}</span>
      </div>
      <div className="flex items-center gap-1">
        {profile.role === 'admin' && (
          <Link href="/admin/requests"
            className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg">
            <ShieldCheck size={18} />
          </Link>
        )}
        <button onClick={handleSignOut}
          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  )
}
