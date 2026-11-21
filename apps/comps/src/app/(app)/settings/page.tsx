import { PageHead } from '@/components/PageHead'
import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { PAGE_HEADS } from '@/lib/copy'

/** Settings (app PRD §7.5): a centered 1040 px column; `?tab=types` opens Property types. */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams
  return (
    <main className="addwrap" style={{ maxWidth: 1040 }}>
      <PageHead title={PAGE_HEADS.settings.title} sub={PAGE_HEADS.settings.sub} style={{ paddingTop: 8 }} />
      <SettingsScreen initialTab={tab === 'types' ? 'types' : 'locs'} />
    </main>
  )
}
