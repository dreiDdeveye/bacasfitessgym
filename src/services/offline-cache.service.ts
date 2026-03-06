"use client"

import type { User, Subscription, ActiveSession } from "@/src/types"

const KEYS = {
  users: "offline_cache_users",
  subscriptions: "offline_cache_subscriptions",
  activeSessions: "offline_cache_active_sessions",
}

function getItem<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function setItem(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    console.error("Failed to write to localStorage:", e)
  }
}

// ==============================
// USERS
// ==============================

export function cacheUsers(users: User[]): void {
  const map: Record<string, User> = {}
  for (const u of users) map[u.userId] = u
  setItem(KEYS.users, map)
}

export function cacheUser(user: User): void {
  const map = getItem<Record<string, User>>(KEYS.users) || {}
  map[user.userId] = user
  setItem(KEYS.users, map)
}

export function getCachedUser(userId: string): User | null {
  const map = getItem<Record<string, User>>(KEYS.users)
  return map?.[userId] || null
}

export function getCachedUsers(): User[] {
  const map = getItem<Record<string, User>>(KEYS.users)
  return map ? Object.values(map) : []
}

// ==============================
// SUBSCRIPTIONS
// ==============================

export function cacheSubscriptions(subs: Subscription[]): void {
  const map: Record<string, Subscription> = {}
  for (const s of subs) map[s.userId] = s
  setItem(KEYS.subscriptions, map)
}

export function cacheSubscription(sub: Subscription): void {
  const map = getItem<Record<string, Subscription>>(KEYS.subscriptions) || {}
  map[sub.userId] = sub
  setItem(KEYS.subscriptions, map)
}

export function getCachedSubscription(userId: string): Subscription | null {
  const map = getItem<Record<string, Subscription>>(KEYS.subscriptions)
  return map?.[userId] || null
}

export function getCachedSubscriptions(): Subscription[] {
  const map = getItem<Record<string, Subscription>>(KEYS.subscriptions)
  return map ? Object.values(map) : []
}

// ==============================
// ACTIVE SESSIONS
// ==============================

export function cacheActiveSessions(sessions: ActiveSession[]): void {
  const map: Record<string, ActiveSession> = {}
  for (const s of sessions) map[s.userId] = s
  setItem(KEYS.activeSessions, map)
}

export function getCachedActiveSession(userId: string): ActiveSession | null {
  const map = getItem<Record<string, ActiveSession>>(KEYS.activeSessions)
  return map?.[userId] || null
}

export function getCachedActiveSessions(): ActiveSession[] {
  const map = getItem<Record<string, ActiveSession>>(KEYS.activeSessions)
  return map ? Object.values(map) : []
}

export function updateCachedSession(userId: string, session: ActiveSession | null): void {
  const map = getItem<Record<string, ActiveSession>>(KEYS.activeSessions) || {}
  if (session) {
    map[userId] = session
  } else {
    delete map[userId]
  }
  setItem(KEYS.activeSessions, map)
}

export const offlineCache = {
  cacheUsers,
  cacheUser,
  getCachedUser,
  getCachedUsers,
  cacheSubscriptions,
  cacheSubscription,
  getCachedSubscription,
  getCachedSubscriptions,
  cacheActiveSessions,
  getCachedActiveSession,
  getCachedActiveSessions,
  updateCachedSession,
}
