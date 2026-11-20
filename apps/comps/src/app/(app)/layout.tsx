import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { ConfirmProvider } from '@/components/Confirm'
import { ScrollToTop } from '@/components/ScrollToTop'
import { TipLayer } from '@/components/Tips'
import { ToastProvider } from '@/components/Toast'
import { TopBar } from '@/components/TopBar'
import { getSessionUser } from '@/lib/session'

// Per-user and never cached, so Back after logout cannot show app data (AUTH-005).
export const dynamic = 'force-dynamic'

/** The signed-in app shell: AUTH-001 server-side check, top bar, shared providers. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser()
  if (!user) {
    const path = (await headers()).get('x-comps-path') ?? '/deals'
    redirect(`/login?next=${encodeURIComponent(path)}`)
  }
  return (
    <ToastProvider>
      <ConfirmProvider>
        <TopBar name={user.name} />
        <div className="wrap">{children}</div>
        <TipLayer />
        <ScrollToTop />
      </ConfirmProvider>
    </ToastProvider>
  )
}
