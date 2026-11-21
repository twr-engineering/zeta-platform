import type { CollectionBeforeChangeHook, Field } from 'payload'

/**
 * Who-did-what stamps (Comps app PRD DATA-003), named as in the prototype.
 *
 * Payload's own `updatedAt` changes on every write (trash and restore included), so the
 * business stamps are separate fields owned by this hook:
 * - create:          createdBy, editedBy, editedAt
 * - edit:            editedBy, editedAt
 * - trash / restore: deletedBy only; editedBy/editedAt keep their values, so Undo brings
 *                    back the exact stamps.
 * apps/comps reports editedAt/editedBy as updatedAt/updatedBy in its JSON contract.
 */
const stamp = (name: string, type: 'relationship' | 'date'): Field =>
  (type === 'date'
    ? { name, type: 'date', admin: { readOnly: true, position: 'sidebar' } }
    : { name, type: 'relationship', relationTo: 'users', admin: { readOnly: true, position: 'sidebar' } }) as Field

export const auditFields = (withDeletedBy = false): Field[] => [
  stamp('createdBy', 'relationship'),
  stamp('editedBy', 'relationship'),
  stamp('editedAt', 'date'),
  ...(withDeletedBy ? [stamp('deletedBy', 'relationship')] : []),
]

export const stampAudit: CollectionBeforeChangeHook = ({ context, data, operation, originalDoc, req }) => {
  // System bookkeeping that is not a user edit (Settings delete re-pointing trashed deals to a
  // legacy name) keeps every stamp as saved.
  if (operation === 'update' && context?.keepStamps) return data
  const userId = req.user?.id
  const now = new Date().toISOString()

  // beforeChange receives the merged document, so detect a trash/restore by comparing
  // deletedAt with the stored row rather than by which keys were sent.
  if (operation === 'update' && (originalDoc?.deletedAt ?? null) !== (data.deletedAt ?? null)) {
    data.deletedBy = data.deletedAt ? userId : null
    data.editedBy = originalDoc?.editedBy
    data.editedAt = originalDoc?.editedAt
    return data
  }
  if (operation === 'create') data.createdBy = data.createdBy ?? userId
  data.editedBy = userId ?? data.editedBy
  data.editedAt = now
  return data
}
