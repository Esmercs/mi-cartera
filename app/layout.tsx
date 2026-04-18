import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Mi Cartera',
  description: 'Finanzas personales y en pareja',
  manifest: '/manifest.json',
  themeColor: '#0284c7',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Mi Cartera',
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
