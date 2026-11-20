'use client'

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

type ToastState = { msg: string; action?: string; fn?: () => void } | null
type ToastFn = (msg: string, action?: string, fn?: () => void) => void

const ToastContext = createContext<ToastFn>(() => {})

/** useToast()(msg, action?, fn?): app PRD §6.4. 3.2 s, or 7 s with an action; a new toast replaces the last. */
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback<ToastFn>((msg, action, fn) => {
    if (timer.current) clearTimeout(timer.current)
    setToast({ msg, action, fn })
    timer.current = setTimeout(() => setToast(null), action ? 7000 : 3200)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div id="toast" role="status" hidden={!toast}>
        {toast?.msg}
        {toast?.action && (
          <button
            type="button"
            className="toastact"
            onClick={() => {
              if (timer.current) clearTimeout(timer.current)
              const fn = toast.fn
              setToast(null)
              fn?.()
            }}
          >
            {toast.action}
          </button>
        )}
      </div>
    </ToastContext.Provider>
  )
}
