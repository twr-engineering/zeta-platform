'use client'

import { useCallback, useRef, useState } from 'react'

import { useConfirm } from '@/components/Confirm'
import { Icon } from '@/components/Icon'
import { LoadError, TableSkeleton } from '@/components/LoadState'
import { InfoButton } from '@/components/Tips'
import { useToast } from '@/components/Toast'
import type { LocationJSON, TypeJSON } from '@/lib/data'
import { pinText } from '@/lib/format'
import { CATEGORIES, FORM_NAME, SETTINGS_COPY, checkPlace, checkType, cleanName, savedToast } from '@/lib/settings'
import { api, useData, type ApiResult } from '@/lib/store'

import { PlaceDialog, type PlaceDraft } from './PlaceDialog'
import { RowMenu, type RowMenuTarget } from './RowMenu'
import { TypeDialog, type TypeDraft } from './TypeDialog'

type Tab = 'locs' | 'types'
type Dlg = { kind: 'loc'; editing: LocationJSON | null } | { kind: 'type'; editing: TypeJSON | null } | null

const dealsCell = (n: number) => (
  <>
    {n}
    <span className="nar"> deal{n === 1 ? '' : 's'}</span>
  </>
)

const StatusPill = ({ hidden }: { hidden: boolean }) => <span className={`pill status ${hidden ? 'off' : 'on'}`}>{hidden ? 'Hidden' : 'Shown'}</span>

/** Settings (app PRD §7.5): the two lists the team uses, with every rule of §7.5.4–7.5.6. */
export function SettingsScreen({ initialTab }: { initialTab: Tab }) {
  const { status, locations, types, refresh } = useData()
  const toast = useToast()
  const confirm = useConfirm()
  const [tab, setTabState] = useState<Tab>(initialTab)
  const [err, setErr] = useState('')
  const [dlg, setDlg] = useState<Dlg>(null)
  const [dlgErr, setDlgErr] = useState('')
  const [menu, setMenu] = useState<RowMenuTarget | null>(null)
  const [busy, setBusy] = useState(false)
  const [dlgSeq, setDlgSeq] = useState(0)
  const saving = useRef(false)
  const tabRefs = { locs: useRef<HTMLButtonElement>(null), types: useRef<HTMLButtonElement>(null) }

  const setTab = (t: Tab, focus = false) => {
    setTabState(t)
    setErr('')
    window.history.replaceState(null, '', t === 'types' ? '/settings?tab=types' : '/settings')
    if (focus) tabRefs[t].current?.focus()
  }

  /**
   * One Settings save at a time (§7.5.4): starting one clears the banner; while it runs other
   * saves are ignored and the dialog's submit is disabled. Errors go to the open dialog's box,
   * or the banner. 409/422 carry the exact copy; anything else is the generic message.
   */
  const save = async <T,>(call: () => Promise<ApiResult<T>>, message: (data: T) => string, inDialog: boolean) => {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    setErr('')
    const r = await call()
    if (r.ok) {
      toast(message(r.data))
      if (inDialog) setDlg(null)
      await refresh()
    } else {
      const msg = (r.status === 409 || r.status === 422) && r.message ? r.message : SETTINGS_COPY.saveFailed
      if (inDialog) setDlgErr(msg)
      else setErr(msg)
    }
    saving.current = false
    setBusy(false)
  }

  const openDlg = (d: NonNullable<Dlg>) => {
    setDlgErr('')
    setDlgSeq((n) => n + 1)
    setDlg(d)
  }

  const closeMenu = useCallback((focusBack: boolean) => {
    setMenu((m) => {
      if (m) {
        m.button.setAttribute('aria-expanded', 'false')
        if (focusBack && m.button.isConnected) m.button.focus()
      }
      return null
    })
  }, [])

  const openMenu = (t: Omit<RowMenuTarget, 'button'>, button: HTMLButtonElement) => {
    if (menu?.button === button) return closeMenu(true)
    if (menu) menu.button.setAttribute('aria-expanded', 'false')
    button.setAttribute('aria-expanded', 'true')
    setMenu({ ...t, button })
  }

  const toggleHidden = (kind: 'loc' | 'type', id: number) => {
    const list: (LocationJSON | TypeJSON)[] = kind === 'loc' ? locations : types
    const item = list.find((x) => x.id === id)!
    if (!item.hidden && list.filter((x) => !x.hidden).length <= 1)
      return setErr(kind === 'loc' ? SETTINGS_COPY.lastShownPlace : SETTINGS_COPY.lastShownType)
    const hidden = !item.hidden
    void save(
      () => api(`/api/${kind === 'loc' ? 'locations' : 'types'}/${id}`, 'PATCH', { hidden }),
      () => `${item.name} ${hidden ? 'hidden from the add form' : 'shown in the add form'}`,
      false,
    )
  }

  const askDelete = (kind: 'loc' | 'type', id: number) => {
    const list: (LocationJSON | TypeJSON)[] = kind === 'loc' ? locations : types
    const item = list.find((x) => x.id === id)!
    if (list.length <= 1) return setErr(kind === 'loc' ? SETTINGS_COPY.lastPlace : SETTINGS_COPY.lastType)
    confirm(`Delete ${item.name}?`, 'It will be removed from the list for everyone. No closed deals use it. This cannot be undone.', 'Delete', () => {
      if (!list.some((x) => x.id !== id && !x.hidden)) return setErr(SETTINGS_COPY.noneShownLeft)
      void save(() => api(`/api/${kind === 'loc' ? 'locations' : 'types'}/${id}`, 'DELETE'), () => `${item.name} deleted`, false)
    })
  }

  const submitPlace = (d: PlaceDraft) => {
    if (dlg?.kind !== 'loc' || saving.current) return
    const editing = dlg.editing
    const fail = checkPlace(d, locations, editing?.id)
    if (fail) return setDlgErr(fail.message)
    const name = cleanName(d.name)
    const body = { name, kind: d.kind, center: d.center }
    void save<{ dealsMoved?: number }>(
      () => (editing ? api(`/api/locations/${editing.id}`, 'PATCH', body) : api('/api/locations', 'POST', body)),
      (r) => savedToast(editing ? editing.name : null, name, r.dealsMoved ?? 0),
      true,
    )
  }

  const submitType = (d: TypeDraft, locked: boolean) => {
    if (dlg?.kind !== 'type' || saving.current) return
    const editing = dlg.editing
    const fail = checkType(d, types, editing?.id)
    if (fail) return setDlgErr(fail.message)
    const name = cleanName(d.name)
    const body = locked ? { name, category: d.category } : { name, category: d.category, form: d.form }
    void save<{ dealsMoved?: number }>(
      () => (editing ? api(`/api/types/${editing.id}`, 'PATCH', body) : api('/api/types', 'POST', body)),
      (r) => savedToast(editing ? editing.name : null, name, r.dealsMoved ?? 0),
      true,
    )
  }

  const rowProps = (onEdit: () => void, name: string, hidden: boolean) => ({
    className: `clickable${hidden ? ' low' : ''}`,
    tabIndex: 0,
    title: `Edit ${name}`,
    onClick: (e: React.MouseEvent) => {
      if (!(e.target as Element).closest('.kebab')) onEdit()
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.target === e.currentTarget && e.key === 'Enter') {
        e.preventDefault()
        onEdit()
      }
    },
  })

  const kebab = (t: Omit<RowMenuTarget, 'button'>) => (
    <button
      type="button"
      className="kebab"
      aria-haspopup="menu"
      aria-expanded="false"
      aria-label={`More actions for ${t.name}`}
      title="More actions"
      onClick={(e) => {
        e.stopPropagation()
        openMenu(t, e.currentTarget)
      }}
    >
      <Icon name="kebab" />
    </button>
  )

  const sortedTypes = [...types].sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.sortOrder - b.sortOrder)
  const ready = status === 'ready'

  if (status === 'error') return <LoadError />

  return (
    <>
      <div
        className="subtabs"
        role="tablist"
        aria-label="Settings sections"
        onKeyDown={(e) => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
          e.preventDefault()
          setTab(tab === 'locs' ? 'types' : 'locs', true)
        }}
      >
        {(['locs', 'types'] as const).map((t) => (
          <button
            key={t}
            ref={tabRefs[t]}
            type="button"
            className="subtab"
            role="tab"
            id={t === 'locs' ? 'stLocs' : 'stTypes'}
            aria-selected={tab === t}
            aria-controls={t === 'locs' ? 'setLocCard' : 'setTypeCard'}
            tabIndex={tab === t ? 0 : -1}
            onClick={() => setTab(t)}
          >
            {t === 'locs' ? 'Subdivisions and areas' : 'Property types'} <span className="cnt">{ready ? (t === 'locs' ? locations.length : types.length) : ''}</span>
          </button>
        ))}
      </div>
      <div className="err" role="alert" hidden={!err}>
        {err}
      </div>

      {tab === 'locs' ? (
        <section className="card" id="setLocCard" role="tabpanel" aria-labelledby="stLocs">
          <div className="panelhead">
            <p className="muted" style={{ fontSize: 13 }}>
              Hide one to take it off the add form. Its closed deals stay.
            </p>
            <button type="button" className="btn primary" disabled={!ready} onClick={() => openDlg({ kind: 'loc', editing: null })}>
              + Add subdivision or area
            </button>
          </div>
          {ready ? (
            <div className="scroll">
              <table className="settable tstack">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>
                      Kind <InfoButton tip="kind" />
                    </th>
                    <th className="s-pin">
                      Map center <InfoButton tip="mapcenter" />
                    </th>
                    <th className="r">Closed deals</th>
                    <th>
                      Status <InfoButton tip="status" />
                    </th>
                    <th className="r">
                      <span className="srl">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {locations.map((l) => (
                    <tr key={l.id} {...rowProps(() => openDlg({ kind: 'loc', editing: l }), l.name, l.hidden)}>
                      <td className="s-name">
                        <strong>{l.name}</strong>
                      </td>
                      <td className="s-kind">{l.kind === 'Zone' ? 'Area' : 'Subdivision'}</td>
                      <td className="num pin s-pin">{pinText(l.lat, l.lng)}</td>
                      <td className="r num s-n">{dealsCell(l.dealCount)}</td>
                      <td className="s-stat">
                        <StatusPill hidden={l.hidden} />
                      </td>
                      <td className="r s-act">{kebab({ kind: 'loc', id: l.id, name: l.name, hidden: l.hidden, dealCount: l.dealCount })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <TableSkeleton />
          )}
        </section>
      ) : (
        <section className="card" id="setTypeCard" role="tabpanel" aria-labelledby="stTypes">
          <div className="panelhead">
            <p className="muted" style={{ fontSize: 13 }}>
              Each type is priced like a lot, a house or a condo unit.
            </p>
            <button type="button" className="btn primary" disabled={!ready} onClick={() => openDlg({ kind: 'type', editing: null })}>
              + Add property type
            </button>
          </div>
          {ready ? (
            <div className="scroll">
              <table className="settable tstack">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>
                      Category <InfoButton tip="category" />
                    </th>
                    <th>
                      Priced per sqm of <InfoButton tip="pricedby" />
                    </th>
                    <th className="r">Closed deals</th>
                    <th>
                      Status <InfoButton tip="status" />
                    </th>
                    <th className="r">
                      <span className="srl">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTypes.map((t) => (
                    <tr key={t.id} {...rowProps(() => openDlg({ kind: 'type', editing: t }), t.name, t.hidden)}>
                      <td className="s-name">
                        <strong>{t.name}</strong>
                      </td>
                      <td className="s-kind">{t.category}</td>
                      <td className="s-form">{FORM_NAME[t.form]}</td>
                      <td className="r num s-n">{dealsCell(t.dealCount)}</td>
                      <td className="s-stat">
                        <StatusPill hidden={t.hidden} />
                      </td>
                      <td className="r s-act">{kebab({ kind: 'type', id: t.id, name: t.name, hidden: t.hidden, dealCount: t.dealCount })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <TableSkeleton />
          )}
        </section>
      )}

      {menu && (
        <RowMenu
          target={menu}
          onClose={closeMenu}
          onEdit={() => {
            closeMenu(false)
            if (menu.kind === 'loc') openDlg({ kind: 'loc', editing: locations.find((l) => l.id === menu.id) ?? null })
            else openDlg({ kind: 'type', editing: types.find((t) => t.id === menu.id) ?? null })
          }}
          onToggle={() => {
            closeMenu(false)
            toggleHidden(menu.kind, menu.id)
          }}
          onDelete={() => {
            closeMenu(false)
            askDelete(menu.kind, menu.id)
          }}
        />
      )}

      <PlaceDialog
        key={`loc-${dlgSeq}`}
        open={dlg?.kind === 'loc'}
        editing={dlg?.kind === 'loc' ? dlg.editing : null}
        error={dlgErr}
        busy={busy}
        onClose={() => setDlg(null)}
        onSubmit={submitPlace}
        onInput={() => setDlgErr('')}
      />
      <TypeDialog
        key={`type-${dlgSeq}`}
        open={dlg?.kind === 'type'}
        editing={dlg?.kind === 'type' ? dlg.editing : null}
        error={dlgErr}
        busy={busy}
        onClose={() => setDlg(null)}
        onSubmit={submitType}
        onInput={() => setDlgErr('')}
      />
    </>
  )
}
