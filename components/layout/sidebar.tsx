'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  CreditCard,
  CalendarDays,
  PartyPopper,
  ShieldCheck,
  LogOut,
  Wallet,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Profile } from '@/types/database'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  adminOnly?: boolean
}

const navItems: NavItem[] = [
  { href: '/dashboard',    label: 'Mi Dashboard',      icon: <LayoutDashboard size={18} /> },
  { href: '/shared',       label: 'Compartido',         icon: <Users size={18} /> },
  { href: '/gastos-fijos', label: 'Gastos Fijos',       icon: <CalendarDays size={18} /> },
  { href: '/financiamiento', label: 'Financiamiento',   icon: <CreditCard size={18} /> },
  { href: '/diversion',    label: 'Diversión',          icon: <PartyPopper size={18} /> },
  { href: '/deudas',       label: 'Deudas',             icon: <Wallet size={18} /> },
  { href: '/admin/requests', label: 'Admin',            icon: <ShieldCheck size={18} />, adminOnly: true },
]

interface SidebarProps {
  profile: Profile
}

export default function Sidebar({ profile }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const isLalo = profile.display_name?.toLowerCase() === 'lalo'

  return (
    <aside className="w-[240px] min-h-screen bg-white border-r flex flex-col sticky top-0 h-screen">
      {/* Logo */}
      <div className="px-6 py-5 border-b">
        <h1 className="text-xl font-bold text-brand-700">Mi Cartera</h1>
        <div className="mt-2 flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white
              ${isLalo ? 'bg-lalo' : 'bg-ale'}`}
          >
            {profile.display_name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <span className="text-sm font-medium text-gray-700">
            {profile.display_name ?? profile.full_name}
          </span>
          {profile.role === 'admin' && (
            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
              Admin
            </span>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems
          .filter(item => !item.adminOnly || profile.role === 'admin')
          .map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${active
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
              >
                {item.icon}
                {item.label}
              </Link>
            )
          })}
      </nav>

      {/* Sign out */}
      <div className="px-3 py-4 border-t">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium
                     text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors w-full"
        >
          <LogOut size={18} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
