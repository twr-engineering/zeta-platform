/**
 * `pnpm pending`       — print every placeholder still standing in for an uncaptured rule.
 * `pnpm pending --md`  — regenerate docs/PENDING.md from the registry.
 */
import { writeFileSync } from 'node:fs'

import { PENDING } from '../src/lib/parity/pending'

const GROUPS = [
  ['client', 'Waiting on the client'],
  ['live-check', 'Needs a check against production'],
  ['capture', 'Readable from the local artefacts (capture work)'],
] as const
const rows = Object.entries(PENDING)

if (process.argv.includes('--md')) {
  let md = `# Pending rules\n\nGenerated from \`packages/parity/src/pending.ts\` by \`pnpm pending --md\`. Do not edit by hand.\n\nEach entry is a placeholder: the code runs an interim behaviour at the marked point and logs\n\`[parity:pending]\` once. When a rule is captured and signed in the matrix, implement it, delete\nthe entry, and let the type checker show the remaining call sites.\n`
  for (const [key, title] of GROUPS) {
    const group = rows.filter(([, r]) => r.blockedOn === key)
    md += `\n## ${title} (${group.length})\n\n| Id | Refs | Needed | Unblocks when | Interim |\n|---|---|---|---|---|\n`
    for (const [id, r] of group) md += `| \`${id}\` | ${r.refs.join(', ')} | ${r.need} | ${r.unblock} | ${r.interim} |\n`
  }
  writeFileSync(new URL('../docs/PENDING.md', import.meta.url), md)
  console.log(`docs/PENDING.md — ${rows.length} entries`)
} else {
  for (const [key, title] of GROUPS) {
    const group = rows.filter(([, r]) => r.blockedOn === key)
    console.log(`\n${title} (${group.length})`)
    for (const [id, r] of group) console.log(`  ${id.padEnd(26)} ${r.refs.join(', ').padEnd(30)} ${r.unblock}`)
  }
}
