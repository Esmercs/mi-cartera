'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

interface Props {
  offset: number
  label: string
}

export default function PeriodNavButton({ offset, label }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(() => {
      router.push(`?p=${offset}`)
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="text-xs px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-400
                 hover:text-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {isPending ? <Loader2 size={11} className="animate-spin" /> : label}
    </button>
  )
}
