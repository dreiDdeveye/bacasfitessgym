"use client"

import { supabase } from "./supabase"
import { runAutoBackup, isAutoBackupEnabled } from "./backup.service"
import type { RealtimeChannel } from "@supabase/supabase-js"

// ─── Config ───────────────────────────────────────────────────────────────────
// Wait 5s after the last change before triggering a backup.
// Prevents hammering the endpoint on rapid successive writes (e.g. bulk scan logs).
const DEBOUNCE_MS = 5000

const WATCHED_TABLES = ["users", "subscriptions", "scan_logs", "payment"]

// ─── Internal state ───────────────────────────────────────────────────────────
let channel: RealtimeChannel | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let isBacking = false

// ─── Change event listener (used to update the UI) ────────────────────────────
export type ChangeEvent = {
  table: string
  event: "INSERT" | "UPDATE" | "DELETE"
  triggeredAt: string
}

type ChangeListener = (e: ChangeEvent) => void
const changeListeners: Set<ChangeListener> = new Set()

export function onRealtimeChange(fn: ChangeListener) {
  changeListeners.add(fn)
  return () => changeListeners.delete(fn)   // returns unsubscribe fn
}

function emitChange(table: string, event: "INSERT" | "UPDATE" | "DELETE") {
  const e: ChangeEvent = { table, event, triggeredAt: new Date().toISOString() }
  changeListeners.forEach((fn) => fn(e))
}

// ─── Debounced backup trigger ─────────────────────────────────────────────────
function scheduleBackup(table: string, event: "INSERT" | "UPDATE" | "DELETE") {
  if (!isAutoBackupEnabled()) return

  emitChange(table, event)

  if (debounceTimer) clearTimeout(debounceTimer)

  debounceTimer = setTimeout(async () => {
    if (isBacking) return
    isBacking = true
    try {
      await runAutoBackup()
    } finally {
      isBacking = false
    }
  }, DEBOUNCE_MS)
}

// ─── Start / stop ─────────────────────────────────────────────────────────────
export function startRealtimeBackup(): void {
  if (channel) return  // already subscribed

  channel = supabase.channel("realtime-backup")

  WATCHED_TABLES.forEach((table) => {
    channel!
      .on("postgres_changes", { event: "INSERT", schema: "public", table },
        () => scheduleBackup(table, "INSERT"))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table },
        () => scheduleBackup(table, "UPDATE"))
      .on("postgres_changes", { event: "DELETE", schema: "public", table },
        () => scheduleBackup(table, "DELETE"))
  })

  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      console.log("[RealtimeBackup] ✅ Subscribed to:", WATCHED_TABLES.join(", "))
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      console.warn("[RealtimeBackup] ⚠️ Channel issue:", status)
    }
  })
}

export function stopRealtimeBackup(): void {
  if (!channel) return
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
  supabase.removeChannel(channel)
  channel = null
  console.log("[RealtimeBackup] 🛑 Stopped.")
}

export function isRealtimeBackupRunning(): boolean {
  return channel !== null
}