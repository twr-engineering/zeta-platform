'use client'

import { useState } from 'react'

import { InfoButton } from '@/components/Tips'
import type { TypeJSON } from '@/lib/data'
import { CATEGORIES, FORMS, FORM_COPY, plural, type Category, type Form } from '@/lib/settings'

import { SettingsDialog } from './SettingsDialog'

export type TypeDraft = { name: string; category: Category; form: Form }

/**
 * Add or edit a property type (app PRD §7.5.6). The pricing form is locked while any closed
 * deal uses the type: the cards are disabled, the current one stays visible and checked even
 * for Agricultural (C27), and the client never sends `form`.
 */
export function TypeDialog({
  open,
  editing,
  error,
  busy,
  onClose,
  onSubmit,
  onInput,
}: {
  open: boolean
  editing: TypeJSON | null
  error: string
  busy: boolean
  onClose: () => void
  onSubmit: (d: TypeDraft, locked: boolean) => void
  onInput: () => void
}) {
  // Mounted fresh for each opening (keyed by the caller), so the draft starts from the row.
  const [d, setD] = useState<TypeDraft>(() =>
    editing ? { name: editing.name, category: editing.category, form: editing.form } : { name: '', category: 'Residential', form: 'lot' },
  )
  const n = editing?.dealCount ?? 0
  const locked = !!editing && n > 0

  const setCategory = (category: Category) =>
    // A hidden card cannot stay picked: Agricultural has no unit card, so lot is picked instead.
    setD((x) => ({ ...x, category, form: !locked && !FORM_COPY[category][x.form] ? 'lot' : x.form }))

  const sub = editing
    ? n
      ? `Renaming also updates its ${plural(n, 'closed deal')}. How it is priced is locked while deals use it.`
      : 'No closed deals use it yet.'
    : 'Keep types few. Add one only if buyers would not compare it with an existing type, and you expect at least 5 deals per location within a year.'

  return (
    <SettingsDialog
      open={open}
      labelId="typeDlgT"
      title={editing ? `Edit ${editing.name}` : 'Add a property type'}
      sub={sub}
      error={error}
      busy={busy}
      submitLabel={editing ? 'Save changes' : 'Add type'}
      onClose={onClose}
      onSubmit={() => onSubmit(d, locked)}
      onInput={onInput}
    >
      <label className="f" htmlFor="ntName">
        Name
        <input
          type="text"
          id="ntName"
          name="name"
          maxLength={40}
          placeholder="Such as Warehouse"
          autoComplete="off"
          value={d.name}
          onChange={(e) => setD({ ...d, name: e.target.value })}
        />
      </label>
      <fieldset className="choices">
        <legend className="lt">
          Category <InfoButton tip="category" />
        </legend>
        <div className="tags">
          {CATEGORIES.map((c) => (
            <label className="tag" key={c}>
              <input type="radio" name="ntCat" value={c} checked={d.category === c} onChange={() => setCategory(c)} /> {c}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="choices">
        <legend className="lt">
          Priced per sqm of <InfoButton tip="pricedby" />
        </legend>
        {FORMS.map((f) => {
          const copy = FORM_COPY[d.category][f] ?? (locked && d.form === f ? FORM_COPY.Commercial[f] : null)
          if (!copy) return null
          return (
            <label className="choice" key={f}>
              <input type="radio" name="ntForm" value={f} checked={d.form === f} disabled={locked} onChange={() => setD({ ...d, form: f })} />
              <span>
                <strong>{copy[0]}</strong>
                <span className="desc">
                  For example: {copy[1]}. {FORM_COPY.base[f]}
                </span>
              </span>
            </label>
          )
        })}
      </fieldset>
    </SettingsDialog>
  )
}
