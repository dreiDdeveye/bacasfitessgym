"use client"

import { useEffect, useRef } from "react"
import { supabase } from "@/src/services/supabase"
import {
  isAutoBackupEnabled,
  runAutoBackup,
} from "@/src/services/backup.service"

const DEBOUNCE_MS = 10_000 // wait 10s after last change before backing up

const WATCHED_TABLES = [
  "users",
  "subscriptions",
  "subscription_history",
  "scan_logs",
  "active_sessions",
  "medical_history",
  "emergency_contacts",
  "liability_waivers",
]

export function useAutoBackup() {
  const isRunningRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const triggerBackup = () => {
      if (!isAutoBackupEnabled()) return
      if (isRunningRef.current) return

      // Debounce: reset timer on each change, backup after quiet period
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        if (isRunningRef.current) return
        isRunningRef.current = true
        try {
          await runAutoBackup()
        } finally {
          isRunningRef.current = false
        }
      }, DEBOUNCE_MS)
    }

    // Subscribe to all watched tables
    const channel = supabase
      .channel("auto-backup")

    for (const table of WATCHED_TABLES) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        triggerBackup,
      )
    }

    channel.subscribe()

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      supabase.removeChannel(channel)
    }
  }, [])
}
