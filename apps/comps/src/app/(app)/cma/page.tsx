import { PageHead } from '@/components/PageHead'
import { InfoButton } from '@/components/Tips'
import { LoadGate } from '@/components/LoadState'
import { PAGE_HEADS } from '@/lib/copy'

// CMA (M7). M1: page head with its "i" button (title, non-breaking space, then the button).
export default function CmaPage() {
  return (
    <main>
      <PageHead
        title={PAGE_HEADS.cma.title}
        sub={PAGE_HEADS.cma.sub}
        after={
          <>
            {' '}
            <InfoButton tip="cma" />
          </>
        }
      />
      <LoadGate />
    </main>
  )
}
