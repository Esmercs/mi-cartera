import Link from 'next/link'

export default function PendingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100 px-4">
      <div className="w-full max-w-sm card p-8 text-center space-y-4">
        <div className="text-5xl">⏳</div>
        <h2 className="text-xl font-bold text-gray-800">Acceso pendiente</h2>
        <p className="text-gray-600 text-sm leading-relaxed">
          Tu cuenta está esperando aprobación del administrador. Una vez aprobada,
          podrás entrar a la app.
        </p>
        <p className="text-gray-400 text-xs">
          Si ya pasó tiempo y no has recibido respuesta, contacta al administrador.
        </p>
        <Link
          href="/login"
          className="text-brand-600 text-sm font-medium hover:underline block"
        >
          Intentar de nuevo
        </Link>
      </div>
    </div>
  )
}
