'use client'
import { createContext, useContext, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import type { ReactNode } from 'react'

const PrivacyContext = createContext<{ hidden: boolean; toggle: () => void }>({
  hidden: true,
  toggle: () => {},
})

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(true)
  return (
    <PrivacyContext.Provider value={{ hidden, toggle: () => setHidden(v => !v) }}>
      {children}
    </PrivacyContext.Provider>
  )
}

export function usePrivacy() {
  return useContext(PrivacyContext)
}

/** Monto enmascarable: muestra •••• cuando la privacidad está activa */
export const MASKED = '$ ••••'

export function PrivacyToggle() {
  const { hidden, toggle } = usePrivacy()
  return (
    <button
      onClick={toggle}
      title={hidden ? 'Mostrar cantidades privadas' : 'Ocultar cantidades privadas'}
      className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
    >
      {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  )
}
