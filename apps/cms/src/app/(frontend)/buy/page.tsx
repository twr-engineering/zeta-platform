import { LoanCalculator } from '@/components/LoanCalculator'
import { Pending } from '@/components/Pending'
import { DEFAULT_INCOME_MULTIPLE } from '@/lib/calculator'
import { payload } from '@/lib/site/payload'

export const metadata = { title: 'Buy a property' }

export default async function BuyPage() {
  const defaults = await (await payload()).findGlobal({ slug: 'calculator-defaults', depth: 0 })
  return (
    <section className="buy">
      <h1>Buy</h1>
      <h2>How much can I borrow?</h2>
      <LoanCalculator incomeMultiple={defaults.incomeMultiple ?? DEFAULT_INCOME_MULTIPLE} />
      <Pending id="gated-downloads">The five gated buyer-guide downloads on /buy/.</Pending>
    </section>
  )
}
