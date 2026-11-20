import { redirect } from 'next/navigation'

import { Logo } from '@/components/Logo'
import { getSessionUser } from '@/lib/session'
import { LoginForm } from './LoginForm'

export const dynamic = 'force-dynamic'

/** Login (app PRD §7.7). Already signed in → /deals. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSessionUser()) redirect('/deals')
  const { next } = await searchParams
  // Only same-app paths, never another origin.
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/deals'
  return (
    <main className="loginpage">
      <div className="card logincard">
        <div className="loginlogo">
          <Logo />
        </div>
        <h1>Log in</h1>
        <LoginForm next={target} />
      </div>
    </main>
  )
}
