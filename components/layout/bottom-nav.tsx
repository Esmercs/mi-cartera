'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  CalendarDays,
  CreditCard,
  PartyPopper,
  Wallet,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard',      label: 'Inicio',    icon: LayoutDashboard },
  { href: '/gastos-fijos',   label: 'Fijos',     icon: CalendarDays },
  { href: '/financiamiento', label: 'MSI',       icon: CreditCard },
  { href: '/diversion',      label: 'Diversión', icon: PartyPopper },
  { href: '/deudas',         label: 'Deudas',    icon: Wallet },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t z-40 md:hidden">
      <div className="flex">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors
                ${active ? 'text-brand-600' : 'text-gray-400'}`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
