import { CmaScreen } from '@/components/cma/CmaScreen'
import { PageHead } from '@/components/PageHead'
import { InfoButton } from '@/components/Tips'
import { PAGE_HEADS } from '@/lib/copy'

/** CMA (app PRD §7.3): page head with its "i" button (title, non-breaking space, then the button). */
export default function CmaPage() {
  return (
    <main className="view">
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
      <CmaScreen />
    </main>
  )
}
