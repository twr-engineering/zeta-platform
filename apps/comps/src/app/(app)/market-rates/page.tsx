import { PageHead } from '@/components/PageHead'
import { RatesScreen } from '@/components/rates/RatesScreen'
import { PAGE_HEADS } from '@/lib/copy'

/** Market rates (app PRD §7.2): page head, filter bar, rates card, trend card. */
export default function MarketRatesPage() {
  return (
    <main className="view">
      <PageHead title={PAGE_HEADS.rates.title} sub={PAGE_HEADS.rates.sub} />
      <RatesScreen />
    </main>
  )
}
