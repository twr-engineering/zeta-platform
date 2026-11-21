'use client'

import { useMemo, useState } from 'react'

import { PinMap } from '@/components/map/PinMap'
import { InfoButton } from '@/components/Tips'
import { pinText } from '@/lib/format'
import type { LocationJSON } from '@/lib/data'
import { parsePin, pinOk, plural, type Kind } from '@/lib/settings'
import { useData } from '@/lib/store'

import { SettingsDialog } from './SettingsDialog'

export type PlaceDraft = { name: string; kind: Kind; center: string }

/** Add or edit a subdivision or area (app PRD §7.5.5). The map (9.5) arrives in M5. */
export function PlaceDialog({
  open,
  editing,
  error,
  busy,
  onClose,
  onSubmit,
  onInput,
  initialCenter,
  subOverride,
}: {
  open: boolean
  editing: LocationJSON | null
  error: string
  busy: boolean
  onClose: () => void
  onSubmit: (d: PlaceDraft) => void
  onInput: () => void
  /** Opened from the add form with a valid pin (§7.4.2): the center starts at the pin. */
  initialCenter?: string
  subOverride?: string
}) {
  // Mounted fresh for each opening (keyed by the caller), so the draft starts from the row.
  const [d, setD] = useState<PlaceDraft>(() =>
    editing ? { name: editing.name, kind: editing.kind, center: pinText(editing.lat, editing.lng) } : { name: '', kind: 'Subdivision', center: initialCenter ?? '' },
  )

  const locations = useData((x) => x.locations)
  // The map (§9.5): other saved places as context, the center as a draggable pin.
  const others = useMemo(() => locations.filter((l) => l.id !== editing?.id).map((l) => ({ id: l.id, name: l.name, lat: l.lat, lng: l.lng })), [locations, editing])
  const pin = useMemo(() => {
    const p = parsePin(d.center)
    return pinOk(p) ? { lat: p.lat, lng: p.lng } : null
  }, [d.center])
  const noDots = useMemo(() => [], [])

  const n = editing?.dealCount ?? 0
  const sub = subOverride
    ? subOverride
    : editing
    ? n
      ? `Renaming also updates its ${plural(n, 'closed deal')}.`
      : 'No closed deals use it yet.'
    : 'It will show up in the add form, the filters and the pin suggestion.'

  return (
    <SettingsDialog
      open={open}
      labelId="locDlgT"
      title={editing ? `Edit ${editing.name}` : 'Add a subdivision or area'}
      sub={sub}
      error={error}
      busy={busy}
      submitLabel={editing ? 'Save changes' : 'Add subdivision or area'}
      onClose={onClose}
      onSubmit={() => onSubmit(d)}
      onInput={onInput}
    >
      <label className="f" htmlFor="nlName">
        Name
        <input
          type="text"
          id="nlName"
          name="name"
          maxLength={60}
          placeholder="Such as Alegria Hills"
          autoComplete="off"
          value={d.name}
          onChange={(e) => setD({ ...d, name: e.target.value })}
        />
      </label>
      <fieldset className="choices">
        <legend className="lt">
          Kind <InfoButton tip="kind" />
        </legend>
        <label className="choice">
          <input type="radio" name="nlKind" value="Subdivision" checked={d.kind === 'Subdivision'} onChange={() => setD({ ...d, kind: 'Subdivision' })} />
          <span>
            <strong>Subdivision or project</strong>
            <span className="desc">A registered subdivision, village or condo project, like Xavier Estates or Centrio.</span>
          </span>
        </label>
        <label className="choice">
          <input type="radio" name="nlKind" value="Zone" checked={d.kind === 'Zone'} onChange={() => setD({ ...d, kind: 'Zone' })} />
          <span>
            <strong>Area outside subdivisions</strong>
            <span className="desc">
              A road or part of town with lots that are not in any subdivision, like the uptown main road. Lots here need frontage and an exact pin.
            </span>
          </span>
        </label>
      </fieldset>
      <label className="f" htmlFor="nlPin">
        <span className="lt">
          Map center (latitude, longitude) <InfoButton tip="mapcenter" />
        </span>
        <input
          type="text"
          className="mono"
          id="nlPin"
          name="center"
          placeholder="Such as 8.47000, 124.65000"
          autoComplete="off"
          value={d.center}
          onChange={(e) => setD({ ...d, center: e.target.value })}
        />
      </label>
      <p className="hint">Copy it from Google Maps by right-clicking the middle of the area.</p>
      <PinMap
        pin={pin}
        places={others}
        dots={noDots}
        chosenId={null}
        label="Click to set the map center"
        pinZoom={16}
        onPick={(p) => {
          setD((cur) => ({ ...cur, center: pinText(p.lat, p.lng) }))
          onInput()
        }}
      />
    </SettingsDialog>
  )
}

