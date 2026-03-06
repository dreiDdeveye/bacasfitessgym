"use client"

import { supabase } from "./supabase"

const QUEUE_KEY = "offline_queue"
const MAX_RETRIES = 5

export interface OfflineQueueItem {
  id: string
  timestamp: number
  operation: "insert" | "delete"
  table: "scan_logs" | "active_sessions"
  data: Record<string, unknown>
  retryCount: number
  lastError?: string
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function getQueue(): OfflineQueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveQueue(queue: OfflineQueueItem[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch (e) {
    console.error("Failed to save offline queue:", e)
  }
}

export function enqueue(
  table: OfflineQueueItem["table"],
  operation: OfflineQueueItem["operation"],
  data: Record<string, unknown>,
): void {
  const queue = getQueue()
  queue.push({
    id: generateId(),
    timestamp: Date.now(),
    operation,
    table,
    data,
    retryCount: 0,
  })
  saveQueue(queue)
}

export function dequeue(id: string): void {
  const queue = getQueue().filter((item) => item.id !== id)
  saveQueue(queue)
}

export function getPendingCount(): number {
  return getQueue().length
}

export function getPendingItems(): OfflineQueueItem[] {
  return getQueue()
}

async function processItem(item: OfflineQueueItem): Promise<boolean> {
  try {
    if (item.operation === "insert") {
      const { error } = await supabase.from(item.table).insert([item.data])
      if (error) throw error
    } else if (item.operation === "delete") {
      const deleteKey = item.data._deleteKey as string
      const deleteValue = item.data._deleteValue as string
      if (deleteKey && deleteValue) {
        const { error } = await supabase
          .from(item.table)
          .delete()
          .eq(deleteKey, deleteValue)
        if (error) throw error
      }
    }
    return true
  } catch (e) {
    console.error(`Failed to sync queue item ${item.id}:`, e)
    return false
  }
}

export async function flushQueue(): Promise<{ synced: number; failed: number }> {
  const queue = getQueue()
  if (queue.length === 0) return { synced: 0, failed: 0 }

  // Sort oldest first
  queue.sort((a, b) => a.timestamp - b.timestamp)

  let synced = 0
  let failed = 0
  const remaining: OfflineQueueItem[] = []

  for (const item of queue) {
    const success = await processItem(item)
    if (success) {
      synced++
    } else {
      item.retryCount++
      if (item.retryCount < MAX_RETRIES) {
        remaining.push(item)
      } else {
        console.error(`Queue item ${item.id} exceeded max retries, discarding:`, item)
        failed++
      }
    }
  }

  saveQueue(remaining)
  return { synced, failed }
}

export const offlineQueue = {
  enqueue,
  dequeue,
  getQueue: getPendingItems,
  getPendingCount,
  flushQueue,
}
