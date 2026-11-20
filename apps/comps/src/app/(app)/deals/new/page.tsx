import { PageHead } from '@/components/PageHead'
import { PAGE_HEADS } from '@/lib/copy'

// Add a closed deal (M3). M1: page head only.
export default function AddDealPage() {
  return (
    <main className="addwrap">
      <PageHead title={PAGE_HEADS.add.title} sub={PAGE_HEADS.add.sub} />
    </main>
  )
}
