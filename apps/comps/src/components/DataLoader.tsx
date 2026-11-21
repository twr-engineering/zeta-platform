'use client'

import { useEffect } from 'react'

import { useData } from '@/lib/store'

/** Starts the one GET /api/bootstrap for the browser tab (app PRD §5.3, §14.5). */
export function DataLoader() {
  useEffect(() => {
    if (useData.getState().user === null) void useData.getState().load()
  }, [])
  return null
}
