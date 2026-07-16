export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'

// El módulo Financiamiento se unificó con Deudas en Tarjetas (migración 023)
export default function FinanciamientoPage() {
  redirect('/tarjetas')
}
