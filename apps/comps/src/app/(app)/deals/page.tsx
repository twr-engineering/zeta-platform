import { DealsScreen } from '@/components/deals/DealsScreen'
import { PAGE_HEADS } from '@/lib/copy'

/** Closed deals (app PRD §7.1). A visually hidden h1 (C16, A11Y-003). */
export default function DealsPage() {
  return (
    <main className="view">
      <h1 className="srl">{PAGE_HEADS.deals.title}</h1>
      <DealsScreen />
    </main>
  )
}
