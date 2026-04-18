'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  userId: string
  showApproveOnly?: boolean
}

export default function ApproveRejectButtons({ userId, showApproveOnly = false }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)

  async function updateStatus(status: 'approved' | 'rejected') {
    setLoading(status === 'approved' ? 'approve' : 'reject')
    await supabase
      .from('profiles')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', userId)
    setLoading(null)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => updateStatus('approved')}
        disabled={loading !== null}
        className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700
                   disabled:opacity-50 transition-colors font-medium"
      >
        {loading === 'approve' ? '...' : 'Aprobar'}
      </button>
      {!showApproveOnly && (
        <button
          onClick={() => updateStatus('rejected')}
          disabled={loading !== null}
          className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 text-sm rounded-lg
                     hover:bg-red-100 disabled:opacity-50 transition-colors font-medium"
        >
          {loading === 'reject' ? '...' : 'Rechazar'}
        </button>
      )}
    </div>
  )
}
