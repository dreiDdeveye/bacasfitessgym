"use client"

import type {
  User,
  Subscription,
  ScanLog,
  ActiveSession,
  SubscriptionHistory,
} from "@/src/types"
import { supabase } from "./supabase"

//
// ==============================
// USERS
// ==============================
//

export async function getUsers(): Promise<User[]> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching users:", error)
    return []
  }

  return (data || []).map((user) => ({
    userId: user.user_id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  }))
}

export async function getUserById(userId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  if (error || !data) return null

  return {
    userId: data.user_id,
    name: data.name,
    email: data.email,
    phone: data.phone,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}

export async function addUser(user: User): Promise<void> {
  const { error } = await supabase.from("users").insert([
    {
      user_id: user.userId,
      name: user.name,
      email: user.email,
      phone: user.phone,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
    },
  ])

  if (error) console.error("Error adding user:", error)
}

export async function updateUser(
  userId: string,
  updates: Partial<User>,
): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({
      ...(updates.name && { name: updates.name }),
      ...(updates.email && { email: updates.email }),
      ...(updates.phone && { phone: updates.phone }),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)

  if (error) console.error("Error updating user:", error)
}

export async function deleteUser(userId: string): Promise<void> {
  const { error } = await supabase.from("users").delete().eq("user_id", userId)
  if (error) console.error("Error deleting user:", error)
}

//
// ==============================
// SUBSCRIPTIONS
// ==============================
//

export async function getSubscriptions(): Promise<Subscription[]> {
  const { data, error } = await supabase.from("subscriptions").select("*")
  if (error) return []

  return (data || []).map((sub) => ({
    userId: sub.user_id,
    startDate: sub.start_date,
    endDate: sub.end_date,
    status: sub.status,
    createdAt: sub.created_at,
  }))
}

export async function getSubscriptionByUserId(
  userId: string,
): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  if (error || !data) return null

  return {
    userId: data.user_id,
    startDate: data.start_date,
    endDate: data.end_date,
    status: data.status,
    createdAt: data.created_at,
  }
}

export async function addOrUpdateSubscription(
  subscription: Subscription,
): Promise<void> {
  const existing = await getSubscriptionByUserId(subscription.userId)

  if (existing) {
    await archiveSubscription(existing)

    const { error } = await supabase
      .from("subscriptions")
      .update({
        start_date: subscription.startDate,
        end_date: subscription.endDate,
        status: subscription.status,
      })
      .eq("user_id", subscription.userId)

    if (error) console.error("Error updating subscription:", error)
  } else {
    const { error } = await supabase.from("subscriptions").insert([
      {
        user_id: subscription.userId,
        start_date: subscription.startDate,
        end_date: subscription.endDate,
        status: subscription.status,
        created_at: subscription.createdAt,
      },
    ])

    if (error) console.error("Error adding subscription:", error)
  }
}

//
// ==============================
// SCAN LOGS
// ==============================
//

export async function getScanLogs(): Promise<ScanLog[]> {
  const { data, error } = await supabase
    .from("scan_logs")
    .select("*")
    .order("timestamp", { ascending: false })

  if (error) return []

  return (data || []).map((log) => ({
    id: log.id,
    userId: log.user_id,
    userName: log.user_name,
    timestamp: log.timestamp,
    action: log.action,
    status: log.status,
  }))
}

export async function addScanLog(log: ScanLog): Promise<void> {
  if (!log.userId || !log.action || !log.status || !log.timestamp) {
    console.error("Invalid scan log:", log)
    return
  }

  const { error } = await supabase.from("scan_logs").insert([
    {
      user_id: log.userId,
      user_name: log.userName,
      timestamp: log.timestamp,
      action: log.action,
      status: log.status,
    },
  ])

  if (error) console.error("Error adding scan log:", error)
}

export async function getTodayScanLogs(): Promise<ScanLog[]> {
  const today = new Date().toISOString().split("T")[0]

  const { data, error } = await supabase
    .from("scan_logs")
    .select("*")
    .gte("timestamp", `${today}T00:00:00`)
    .lte("timestamp", `${today}T23:59:59`)
    .order("timestamp", { ascending: false })

  if (error) return []

  return (data || []).map((log) => ({
    id: log.id,
    userId: log.user_id,
    userName: log.user_name,
    timestamp: log.timestamp,
    action: log.action,
    status: log.status,
  }))
}

export async function getScanLogsByUserId(
  userId: string,
): Promise<ScanLog[]> {
  const { data, error } = await supabase
    .from("scan_logs")
    .select("*")
    .eq("user_id", userId)
    .order("timestamp", { ascending: false })

  if (error) return []

  return (data || []).map((log) => ({
    id: log.id,
    userId: log.user_id,
    userName: log.user_name,
    timestamp: log.timestamp,
    action: log.action,
    status: log.status,
  }))
}

//
// ==============================
// ACTIVE SESSIONS (CRITICAL FIX)
// ==============================
//

export async function getActiveSessionByUserId(
  userId: string,
): Promise<ActiveSession | null> {
  const { data, error } = await supabase
    .from("active_sessions")
    .select("*")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle()

  if (error || !data) return null

  return {
    userId: data.user_id,
    userName: data.user_name,
    checkInTime: data.check_in_time,
  }
}

export async function getActiveSessions(): Promise<ActiveSession[]> {
  const { data, error } = await supabase
    .from("active_sessions")
    .select("*")
    .order("check_in_time", { ascending: false })

  if (error) return []

  return (data || []).map((s) => ({
    userId: s.user_id,
    userName: s.user_name,
    checkInTime: s.check_in_time,
  }))
}

export async function isUserCheckedIn(userId: string): Promise<boolean> {
  const session = await getActiveSessionByUserId(userId)
  return !!session
}

export async function startSession(session: ActiveSession): Promise<void> {
  const { error } = await supabase.from("active_sessions").insert([
    {
      user_id: session.userId,
      user_name: session.userName,
      check_in_time: session.checkInTime,
    },
  ])

  if (error) console.error("Error starting session:", error)
}

export async function endSession(
  userId: string,
): Promise<ActiveSession | null> {
  const session = await getActiveSessionByUserId(userId)
  if (!session) return null

  const { error } = await supabase
    .from("active_sessions")
    .delete()
    .eq("user_id", userId)

  if (error) {
    console.error("Error ending session:", error)
    return null
  }

  return session
}

//
// ==============================
// USER ID GENERATION
// ==============================
//

export async function generateUserId(): Promise<string> {
  const { data, error } = await supabase
    .from("user_id_counter")
    .select("last_number")
    .single()

  if (error || !data) return "BCF-1001"

  const next = data.last_number + 1

  await supabase.from("user_id_counter").update({ last_number: next }).eq("id", 1)

  return `BCF-${next}`
}

//
// ==============================
// SUBSCRIPTION HISTORY
// ==============================
//

export async function getSubscriptionHistory(
  userId?: string,
): Promise<SubscriptionHistory[]> {
  let query = supabase
    .from("subscription_history")
    .select("*")
    .order("created_at", { ascending: false })

  if (userId) query = query.eq("user_id", userId)

  const { data, error } = await query
  if (error) return []

  return (data || []).map((h) => ({
    id: h.id,
    userId: h.user_id,
    startDate: h.start_date,
    endDate: h.end_date,
    status: h.status,
    createdAt: h.created_at,
    updatedAt: h.updated_at,
  }))
}

export async function archiveSubscription(
  subscription: Subscription,
): Promise<void> {
  const { error } = await supabase.from("subscription_history").insert([
    {
      id: `${subscription.userId}-${Date.now()}`,
      user_id: subscription.userId,
      start_date: subscription.startDate,
      end_date: subscription.endDate,
      status: subscription.status,
      created_at: subscription.createdAt,
      updated_at: new Date().toISOString(),
    },
  ])

  if (error) console.error("Error archiving subscription:", error)
}

//
// ==============================
// BULK USERS
// ==============================
//

export async function addUsers(users: User[]): Promise<void> {
  const { error } = await supabase.from("users").insert(
    users.map((u) => ({
      user_id: u.userId,
      name: u.name,
      email: u.email,
      phone: u.phone,
      created_at: u.createdAt,
      updated_at: u.updatedAt,
    })),
  )

  if (error) console.error("Error bulk adding users:", error)
}

//
// ==============================
// EXPORT
// ==============================
//

export const storageService = {
  getUsers,
  getUserById,
  addUser,
  updateUser,
  deleteUser,
  getSubscriptions,
  getSubscriptionByUserId,
  addOrUpdateSubscription,
  getScanLogs,
  addScanLog,
  getTodayScanLogs,
  getScanLogsByUserId,
  getActiveSessions,
  getActiveSessionByUserId,
  isUserCheckedIn,
  startSession,
  endSession,
  generateUserId,
  getSubscriptionHistory,
  archiveSubscription,
  addUsers,
}

export * as storage from "./storage.service"
