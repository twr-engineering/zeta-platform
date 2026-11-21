'use client'

import { useEffect, useRef, type FormEvent, type ReactNode } from 'react'

/**
 * Modal shell shared by the place and type dialogs (app PRD §7.5.5–7.5.6, §10.6.14): native
 * <dialog> with showModal() (focus trapped, Escape closes, focus returns to the opener),
 * backdrop click closes, typing clears the error box, focus starts on the Name field.
 */
export function SettingsDialog({
  open,
  labelId,
  title,
  sub,
  error,
  busy,
  submitLabel,
  onClose,
  onSubmit,
  onInput,
  children,
}: {
  open: boolean
  labelId: string
  title: string
  sub: string
  error: string
  busy: boolean
  submitLabel: string
  onClose: () => void
  onSubmit: () => void
  onInput: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current!
    if (open && !d.open) {
      d.showModal()
      d.querySelector<HTMLInputElement>('input[name=name]')?.focus()
    } else if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current.close()
      }}
    >
      <form
        className="dlg"
        noValidate
        onInput={onInput}
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          onSubmit()
        }}
      >
        <div>
          <h3 id={labelId}>{title}</h3>
          <p className="hint">{sub}</p>
        </div>
        {children}
        <div className="err" role="alert" hidden={!error}>
          {error}
        </div>
        <div className="dlgacts">
          <button type="button" className="btn" onClick={() => ref.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  )
}
