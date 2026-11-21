'use client'

import { useCallback } from 'react'

import { useConfirm } from '@/components/Confirm'
import { useToast } from '@/components/Toast'
import type { DealJSON } from '@/lib/data'
import { fmtDate, pesoShort } from '@/lib/format'
import { api, useData } from '@/lib/store'

/**
 * Delete with undo (app PRD §7.1.8, A.10, A.11), shared by the edit screen (M3) and the deal
 * details (M4): confirm, soft delete, then a 7 s toast whose Undo restores the same row.
 */
export function useDeleteDeal() {
  const ask = useConfirm()
  const toast = useToast()
  return useCallback(
    (d: DealJSON, after?: () => void) => {
      const label = d.location.name + (d.details ? `, ${d.details}` : '')
      ask('Delete this deal?', `${label}, sold ${pesoShort(d.price)} on ${fmtDate(d.date)}. It will be removed for everyone.`, 'Delete deal', async () => {
        const res = await api<{ id: number }>(`/api/deals/${d.id}`, 'DELETE')
        if (!res.ok) return toast('Could not delete the deal')
        const s = useData.getState()
        s.removeDeal(d.id)
        if (s.selDeal === d.id) s.setSelDeal(null)
        after?.()
        toast('Deal deleted', 'Undo', async () => {
          const back = await api<{ deal: DealJSON }>(`/api/deals/${d.id}/restore`, 'POST')
          if (!back.ok) return toast('Could not restore the deal')
          useData.getState().upsertDeal(back.data.deal)
          useData.getState().setSelDeal(d.id)
          toast('Deal restored')
        })
      })
    },
    [ask, toast],
  )
}
