'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

interface Props {
  offset: number
  label: string
  maxOffset?: number   // oculta › cuando offset >= maxOffset (ej. 0 = no navegar a futuro)
}

export default function PeriodSelector({ offset, label, maxOffset }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function go(to: number) {
    startTransition(() => router.push(`?p=${to}`))
  }

  const btn = `text-xs px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-400
               hover:text-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed`

  return (
    <div className="flex items-center gap-1">
      <button onClick={() => go(offset - 1)} disabled={isPending} className={btn}>‹</button>
      <span className="text-xs text-gray-400 font-medium">
        {isPending ? <Loader2 size={11} className="animate-spin inline" /> : label}
      </span>
      {(maxOffset === undefined || offset < maxOffset) && (
        <button onClick={() => go(offset + 1)} disabled={isPending} className={btn}>›</button>
      )}
      {offset !== 0 && (
        <button onClick={() => go(0)} disabled={isPending} className={`${btn} underline`}>hoy</button>
      )}
    </div>
  )
}
