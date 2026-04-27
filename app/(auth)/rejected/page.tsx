export const dynamic = 'force-dynamic'
import Link from 'next/link'

export default function RejectedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100 px-4">
      <div className="w-full max-w-sm card p-8 text-center space-y-4">
        <div className="text-5xl">🚫</div>
        <h2 className="text-xl font-bold text-gray-800">Acceso denegado</h2>
        <p className="text-gray-600 text-sm leading-relaxed">
          Tu solicitud de acceso fue rechazada. Si crees que esto es un error,
          comunícate con el administrador.
        </p>
        <Link href="/login" className="btn-ghost inline-block text-sm">
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
