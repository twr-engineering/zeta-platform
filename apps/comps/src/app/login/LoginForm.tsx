'use client'

import { useState } from 'react'

import { LOGIN_COPY } from '@/lib/copy'

export function LoginForm({ next }: { next: string }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')
    if (!email || !password) return setErr(LOGIN_COPY.empty)
    setBusy(true)
    setErr('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        window.location.assign(next)
        return
      }
      const code = (await res.json().catch(() => null))?.error?.code
      setErr(code === 'rate_limited' ? LOGIN_COPY.locked : code === 'invalid_credentials' || code === 'validation' ? LOGIN_COPY.wrong : LOGIN_COPY.network)
    } catch {
      setErr(LOGIN_COPY.network)
    }
    setBusy(false)
  }

  return (
    <form className="loginform" onSubmit={onSubmit} onInput={() => err && setErr('')} noValidate>
      <label className="f">
        Email
        <input type="email" name="email" autoComplete="username" />
      </label>
      <label className="f">
        Password
        <input type="password" name="password" autoComplete="current-password" />
      </label>
      <p className="err" role="alert" hidden={!err}>
        {err}
      </p>
      <button className="btn primary" type="submit" disabled={busy}>
        Log in
      </button>
    </form>
  )
}
