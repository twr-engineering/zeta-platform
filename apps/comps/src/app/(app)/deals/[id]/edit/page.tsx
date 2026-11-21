import { PageHead } from '@/components/PageHead'
import { LoadGate } from '@/components/LoadState'
import { PAGE_HEADS } from '@/lib/copy'

// Edit closed deal (M3). M1: page head only.
export default function EditDealPage() {
  return (
    <main className="addwrap">
      <PageHead title={PAGE_HEADS.edit.title} sub={PAGE_HEADS.edit.sub} />
      <LoadGate />
    </main>
  )
}
