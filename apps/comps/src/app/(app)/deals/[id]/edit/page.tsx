import { redirect } from 'next/navigation'

import { DealScreen } from '@/components/deal/DealScreen'

/** Edit closed deal (app PRD §7.4.7). An id that is not a number can never be saved: back to the list. */
export default async function EditDealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d{1,12}$/.test(id)) redirect('/deals')
  // Keyed by id so opening another deal starts a fresh form.
  return <DealScreen key={id} editId={Number(id)} />
}
