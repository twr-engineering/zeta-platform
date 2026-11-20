/**
 * npm run admin:reset-password -- --email {email}  (app PRD AUTH-006)
 * Prompts for a new password (hidden), sets it, and signs out every session of that user.
 * With stdin not a terminal (scripts, tests), the first line of stdin is the password.
 */
import config from '@payload-config'
import { createLocalReq, getPayload, logoutOperation, type PayloadRequest } from 'payload'
import { createInterface } from 'node:readline'

const i = process.argv.indexOf('--email')
const email = i > 0 ? process.argv[i + 1]?.trim().toLowerCase() : undefined
if (!email) {
  console.error('Usage: npm run admin:reset-password -- --email {email}')
  process.exit(1)
}

async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin })
    for await (const line of rl) return line
    return ''
  }
  process.stdout.write('New password: ')
  return new Promise((resolve) => {
    let value = ''
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (ch: string) => {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') {
        process.stdin.setRawMode(false)
        process.stdin.pause()
        process.stdout.write('\n')
        resolve(value)
      } else if (ch === '\u0003') process.exit(130)
      else if (ch === '\u007f') value = value.slice(0, -1)
      else value += ch
    })
  })
}

const payload = await getPayload({ config })
const found = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, overrideAccess: true })
const user = found.docs[0]
if (!user) {
  console.error(`No user with the email ${email}.`)
  process.exit(1)
}
const password = await readPassword()
if (password.length < 8) {
  console.error('Use at least 8 characters.')
  process.exit(1)
}
await payload.update({ collection: 'users', id: user.id, data: { password }, overrideAccess: true })
// Sign out everywhere: Payload's logout with allSessions drops every server-side session, so
// existing JWTs stop validating. (Not a raw db.updateOne with partial data: that replaces
// array/hasMany fields such as roles.)
const req = (await createLocalReq({ user: { ...user, collection: 'users' } as NonNullable<PayloadRequest['user']> }, payload)) as PayloadRequest
await logoutOperation({ collection: payload.collections.users, req, allSessions: true })
console.log(`Password changed for ${email}. Every session was signed out.`)
process.exit(0)
