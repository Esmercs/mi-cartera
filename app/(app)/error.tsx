'use client'
import { RefreshCw } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="max-w-md mx-auto mt-16 card p-6 text-center space-y-3">
      <p className="text-3xl">😵</p>
      <h2 className="font-semibold text-gray-800">Algo salió mal</h2>
      <p className="text-sm text-gray-500">
        No se pudo cargar esta sección. Revisa tu conexión e intenta de nuevo.
      </p>
      <button
        onClick={reset}
        className="btn-primary inline-flex items-center gap-1.5 text-sm mx-auto"
      >
        <RefreshCw size={14} /> Reintentar
      </button>
    </div>
  )
}
