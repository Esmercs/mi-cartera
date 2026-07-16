export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'

// El módulo Compartido se fusionó con Gastos (2026-07-15)
export default function SharedPage() {
  redirect('/gastos-fijos')
}
