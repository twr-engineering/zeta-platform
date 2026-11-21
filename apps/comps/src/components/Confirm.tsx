'use client'

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

type Ask = (title: string, body: string, label: string, action: () => void, onCancel?: () => void) => void
const ConfirmContext = createContext<Ask>(() => {})

/** useConfirm()(title, body, buttonLabel, action, onCancel?): app PRD §6.6, copy in Appendix A.10. */
export const useConfirm = () => useContext(ConfirmContext)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const dlg = useRef<HTMLDialogElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const action = useRef<(() => void) | null>(null)
  const cancelled = useRef<(() => void) | null>(null)
  const [text, setText] = useState({ title: '', body: '', label: '' })

  const ask = useCallback<Ask>((title, body, label, fn, onCancel) => {
    setText({ title, body, label })
    action.current = fn
    cancelled.current = onCancel ?? null
    dlg.current?.showModal()
    // The safe choice is the default: focus goes to Cancel.
    cancel.current?.focus()
  }, [])

  /** Closes the dialog and runs the chosen side: the action, or the cancel callback. */
  const settle = (go: boolean) => {
    const fn = go ? action.current : cancelled.current
    action.current = null
    cancelled.current = null
    dlg.current?.close()
    fn?.()
  }
  const close = () => settle(false)

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <dialog
        id="confirmDlg"
        ref={dlg}
        aria-labelledby="confirmT"
        onClick={(e) => {
          if (e.target === dlg.current) close()
        }}
        onClose={() => {
          // Escape: still pending, so it counts as Cancel.
          if (action.current || cancelled.current) settle(false)
        }}
      >
        <div className="dlg">
          <div>
            <h3 id="confirmT">{text.title}</h3>
            <p className="muted" style={{ marginTop: 6 }}>
              {text.body}
            </p>
          </div>
          <div className="dlgacts">
            <button type="button" className="btn" ref={cancel} onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={() => settle(true)}
            >
              {text.label}
            </button>
          </div>
        </div>
      </dialog>
    </ConfirmContext.Provider>
  )
}
