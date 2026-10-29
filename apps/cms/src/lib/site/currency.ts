import { cookies } from 'next/headers'

import { DISPLAY_CURRENCY_COOKIE } from '@/lib/price'

/** BPM-008: ?currency= -> cookie form_displaycurrency -> first configured (PHP). */
export async function resolveDisplayCurrency(requested?: string | string[]): Promise<string> {
  if (typeof requested === 'string' && requested) return requested
  return (await cookies()).get(DISPLAY_CURRENCY_COOKIE)?.value || 'PHP'
}
