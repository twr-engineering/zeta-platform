import { PageHead } from '@/components/PageHead'
import { PAGE_HEADS } from '@/lib/copy'

// Settings (M2). M1: page head only (padding-top 8 px, §6.1).
export default function SettingsPage() {
  return (
    <main>
      <PageHead title={PAGE_HEADS.settings.title} sub={PAGE_HEADS.settings.sub} style={{ paddingTop: 8 }} />
    </main>
  )
}
