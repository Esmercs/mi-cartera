export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'

// El módulo Deudas se unificó con Financiamiento en Tarjetas (migración 023)
export default function DeudasPage() {
  redirect('/tarjetas')
}
