'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function RegisterPage() {
  const supabase = createClient()

  const [form, setForm] = useState({
    email: '',
    password: '',
    full_name: '',
    display_name: '',
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          full_name: form.full_name,
          display_name: form.display_name,
        },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100 px-4">
        <div className="w-full max-w-sm card p-8 text-center space-y-4">
          <div className="text-5xl">⏳</div>
          <h2 className="text-xl font-bold text-gray-800">Solicitud enviada</h2>
          <p className="text-gray-600 text-sm">
            Tu solicitud fue recibida. Un administrador revisará y aprobará tu acceso.
            Te avisaremos cuando puedas entrar.
          </p>
          <Link href="/login" className="btn-ghost inline-block">
            Volver al inicio
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-900">Mi Cartera</h1>
          <p className="text-gray-500 mt-1">Solicitar acceso</p>
        </div>

        <form onSubmit={handleRegister} className="card p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">Crear cuenta</h2>

          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg border border-red-200">
              {error}
            </div>
          )}

          <div>
            <label className="label" htmlFor="full_name">Nombre completo</label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              className="input"
              value={form.full_name}
              onChange={handleChange}
              placeholder="Eduardo Espinoza"
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="display_name">
              Nombre en la app <span className="text-gray-400">(ej: Lalo, Ale)</span>
            </label>
            <input
              id="display_name"
              name="display_name"
              type="text"
              className="input"
              value={form.display_name}
              onChange={handleChange}
              placeholder="Lalo"
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              name="email"
              type="email"
              className="input"
              value={form.email}
              onChange={handleChange}
              placeholder="correo@ejemplo.com"
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="password">Contraseña</label>
            <input
              id="password"
              name="password"
              type="password"
              className="input"
              value={form.password}
              onChange={handleChange}
              placeholder="Mínimo 8 caracteres"
              minLength={8}
              required
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Enviando solicitud...' : 'Solicitar acceso'}
          </button>

          <p className="text-center text-sm text-gray-500">
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" className="text-brand-600 font-medium hover:underline">
              Iniciar sesión
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
