import { PageHead } from '@/components/PageHead'
import { PAGE_HEADS } from '@/lib/copy'

// Market rates (M6). M1: page head only.
export default function MarketRatesPage() {
  return (
    <main>
      <PageHead title={PAGE_HEADS.rates.title} sub={PAGE_HEADS.rates.sub} />
    </main>
  )
}
