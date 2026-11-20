import configPromise from '@payload-config'
import type { Access, FieldAccess, PayloadRequest, SanitizedConfig } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * Access matrix (Phase 4 gate). The table below IS the policy: changing who can do what
 * means changing this table in the same PR, on purpose. It runs against the fully built
 * config, so collections added by plugins are covered too.
 *
 *   'all'  = unrestricted   'none' = denied   'published' = only _status=published
 *   'self' = only the user's own record
 */
type Outcome = 'all' | 'none' | 'published' | 'self'
type Actor = 'anon' | 'editor' | 'comps' | 'admin'
type Op = 'read' | 'create' | 'update' | 'delete'
type Row = Record<Op, Record<Actor, Outcome>>

// `comps` = a comps-admin user: full access to Zeta Comps, treated like a member of the public
// everywhere else (it can still read and update its own user record).
const PUBLIC_DRAFTED: Row = {
  read: { anon: 'published', editor: 'all', comps: 'published', admin: 'all' },
  create: { anon: 'none', editor: 'all', comps: 'none', admin: 'all' },
  update: { anon: 'none', editor: 'all', comps: 'none', admin: 'all' },
  delete: { anon: 'none', editor: 'none', comps: 'none', admin: 'all' },
}
const PUBLIC_STAFF_EDITED: Row = { ...PUBLIC_DRAFTED, read: { anon: 'all', editor: 'all', comps: 'all', admin: 'all' } }
const COMPS_ONLY: Row = {
  read: { anon: 'none', editor: 'none', comps: 'all', admin: 'all' },
  create: { anon: 'none', editor: 'none', comps: 'all', admin: 'all' },
  update: { anon: 'none', editor: 'none', comps: 'all', admin: 'all' },
  delete: { anon: 'none', editor: 'none', comps: 'all', admin: 'all' },
}

const COLLECTIONS: Record<string, Row> = {
  locations: PUBLIC_DRAFTED,
  pages: PUBLIC_DRAFTED,
  posts: PUBLIC_DRAFTED,
  shortlists: PUBLIC_DRAFTED,
  shorts: PUBLIC_DRAFTED,
  directory: PUBLIC_DRAFTED,
  testimonials: PUBLIC_DRAFTED,
  categories: PUBLIC_STAFF_EDITED,
  tags: PUBLIC_STAFF_EDITED,
  media: PUBLIC_STAFF_EDITED,
  'directory-categories': PUBLIC_STAFF_EDITED,
  'testimonial-categories': PUBLIC_STAFF_EDITED,
  redirects: PUBLIC_STAFF_EDITED,
  listings: {
    read: { anon: 'all', editor: 'all', comps: 'all', admin: 'all' },
    create: { anon: 'none', editor: 'none', comps: 'none', admin: 'all' },
    update: { anon: 'none', editor: 'all', comps: 'none', admin: 'all' },
    delete: { anon: 'none', editor: 'none', comps: 'none', admin: 'all' },
  },
  users: {
    read: { anon: 'none', editor: 'self', comps: 'self', admin: 'all' },
    create: { anon: 'none', editor: 'none', comps: 'none', admin: 'all' },
    update: { anon: 'none', editor: 'self', comps: 'self', admin: 'all' },
    delete: { anon: 'none', editor: 'none', comps: 'none', admin: 'all' },
  },
  'comps-locations': COMPS_ONLY,
  'comps-property-types': COMPS_ONLY,
  // delete without data = permanent delete (admin only); trash is covered in its own test below.
  'comps-deals': { ...COMPS_ONLY, delete: { anon: 'none', editor: 'none', comps: 'none', admin: 'all' } },
}

const GLOBALS: Record<string, Record<'read' | 'update', Record<Actor, Outcome>>> = {
  'site-settings': { read: { anon: 'all', editor: 'all', comps: 'all', admin: 'all' }, update: { anon: 'none', editor: 'none', comps: 'none', admin: 'all' } },
  'calculator-defaults': { read: { anon: 'all', editor: 'all', comps: 'all', admin: 'all' }, update: { anon: 'none', editor: 'none', comps: 'none', admin: 'all' } },
  'crm-state': { read: { anon: 'none', editor: 'all', comps: 'none', admin: 'all' }, update: { anon: 'none', editor: 'none', comps: 'none', admin: 'none' } },
}

const USERS: Record<Actor, PayloadRequest['user']> = {
  anon: null,
  editor: { id: 7, roles: ['editor'], collection: 'users' } as unknown as PayloadRequest['user'],
  comps: { id: 9, roles: ['comps-admin'], collection: 'users' } as unknown as PayloadRequest['user'],
  admin: { id: 1, roles: ['admin'], collection: 'users' } as unknown as PayloadRequest['user'],
}

const reqFor = (actor: Actor, headers: Record<string, string> = {}) =>
  ({ user: USERS[actor], headers: new Headers(headers) }) as unknown as PayloadRequest

async function outcome(fn: Access | undefined, actor: Actor): Promise<Outcome> {
  if (!fn) throw new Error('missing access function (Payload would fall back to "any logged-in user")')
  const result = await fn({ req: reqFor(actor) } as Parameters<Access>[0])
  if (result === true) return 'all'
  if (result === false) return 'none'
  const where = JSON.stringify(result)
  if (where === JSON.stringify({ _status: { equals: 'published' } })) return 'published'
  if (where === JSON.stringify({ id: { equals: USERS[actor]?.id } })) return 'self'
  throw new Error(`unrecognised constraint ${where}`)
}

let config: SanitizedConfig
beforeAll(async () => {
  config = await configPromise
})

describe('every non-internal collection is in the matrix (deny by default)', () => {
  it('has no unlisted collections', () => {
    const slugs = config.collections.map((c) => c.slug).filter((s) => !s.startsWith('payload-'))
    expect(slugs.sort()).toEqual(Object.keys(COLLECTIONS).sort())
  })
  it('has no unlisted globals', () => {
    expect(config.globals.map((g) => g.slug).filter((s) => !s.startsWith('payload-')).sort()).toEqual(Object.keys(GLOBALS).sort())
  })
})

describe('collections', () => {
  for (const [slug, row] of Object.entries(COLLECTIONS)) {
    for (const [op, byActor] of Object.entries(row)) {
      for (const [actor, expected] of Object.entries(byActor)) {
        it(`${slug}.${op} as ${actor} → ${expected}`, async () => {
          const c = config.collections.find((x) => x.slug === slug)!
          expect(await outcome(c.access[op as Op] as Access, actor as Actor)).toBe(expected)
        })
      }
    }
  }
})

describe('globals', () => {
  for (const [slug, row] of Object.entries(GLOBALS)) {
    for (const [op, byActor] of Object.entries(row)) {
      for (const [actor, expected] of Object.entries(byActor)) {
        it(`${slug}.${op} as ${actor} → ${expected}`, async () => {
          const g = config.globals.find((x) => x.slug === slug)!
          expect(await outcome(g.access[op as 'read' | 'update'] as Access, actor as Actor)).toBe(expected)
        })
      }
    }
  }
})

describe('field-level', () => {
  it('only admins can set users.roles (no self-escalation)', async () => {
    const users = config.collections.find((c) => c.slug === 'users')!
    const roles = users.fields.find((f) => 'name' in f && f.name === 'roles') as { access?: Partial<Record<'create' | 'update', FieldAccess>> }
    for (const op of ['create', 'update'] as const) {
      expect(await roles.access?.[op]?.({ req: reqFor('editor') } as Parameters<FieldAccess>[0])).toBe(false)
      expect(await roles.access?.[op]?.({ req: reqFor('admin') } as Parameters<FieldAccess>[0])).toBe(true)
    }
  })
})

describe('job runner', () => {
  it('runs only for admins or the Vercel Cron secret', async () => {
    const run = config.jobs.access!.run!
    process.env.CRON_SECRET = 'test-secret-value'
    expect(await run({ req: reqFor('anon') })).toBe(false)
    expect(await run({ req: reqFor('editor') })).toBe(false)
    expect(await run({ req: reqFor('anon', { authorization: 'Bearer wrong' }) })).toBe(false)
    expect(await run({ req: reqFor('anon', { authorization: 'Bearer test-secret-value' }) })).toBe(true)
    expect(await run({ req: reqFor('admin') })).toBe(true)
    delete process.env.CRON_SECRET
    expect(await run({ req: reqFor('anon', { authorization: 'Bearer undefined' }) })).toBe(false)
  })
})

describe('zeta comps specifics', () => {
  it('comps staff may trash a deal (update setting deletedAt) but not permanently delete', async () => {
    const deals = config.collections.find((c) => c.slug === 'comps-deals')!
    const del = deals.access.delete as Access
    const trash = (actor: Actor) => del({ req: reqFor(actor), data: { deletedAt: new Date().toISOString() } } as Parameters<Access>[0])
    expect(await trash('comps')).toBe(true)
    expect(await trash('editor')).toBe(false)
    expect(await trash('anon')).toBe(false)
    expect(await trash('admin')).toBe(true)
  })

  it('only platform staff can open the CMS admin panel (comps-admin cannot)', async () => {
    const users = config.collections.find((c) => c.slug === 'users')!
    const panel = users.access.admin as (args: { req: PayloadRequest }) => boolean | Promise<boolean>
    expect(await panel({ req: reqFor('admin') })).toBe(true)
    expect(await panel({ req: reqFor('editor') })).toBe(true)
    expect(await panel({ req: reqFor('comps') })).toBe(false)
    expect(await panel({ req: reqFor('anon') })).toBe(false)
  })

  it('staff logins lock after 5 failures for 15 minutes and last 30 days (Comps AUTH-003/004)', () => {
    const auth = config.collections.find((c) => c.slug === 'users')!.auth
    expect(auth.maxLoginAttempts).toBe(5)
    expect(auth.lockTime).toBe(15 * 60 * 1000)
    expect(auth.tokenExpiration).toBe(30 * 24 * 60 * 60)
  })
})
