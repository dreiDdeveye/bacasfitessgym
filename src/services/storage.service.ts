"use client"

import type {
  User,
  Subscription,
  ScanLog,
  ActiveSession,
  SubscriptionHistory,
  MedicalHistory,
  EmergencyContact,
  LiabilityWaiver,
  Payment,
} from "@/src/types"
import { offlineCache } from "./offline-cache.service"
import { offlineQueue } from "./offline-queue.service"

type TableName =
  | "users"
  | "subscriptions"
  | "medical_history"
  | "emergency_contacts"
  | "liability_waivers"
  | "scan_logs"
  | "active_sessions"
  | "subscription_history"
  | "user_id_counter"
  | "payment"

type DbRow = Record<string, any>
type ListCacheEntry = { expiresAt: number; rows: DbRow[] }

const tableNames: TableName[] = [
  "users",
  "subscriptions",
  "medical_history",
  "emergency_contacts",
  "liability_waivers",
  "scan_logs",
  "active_sessions",
  "subscription_history",
  "user_id_counter",
  "payment",
]
const listCacheTtlMs = 30_000
const listCache = new Map<TableName, ListCacheEntry>()
let snapshotRequest: Promise<Record<TableName, DbRow[]>> | null = null

async function excelRequest<T>(
  table: TableName,
  action: "list" | "get" | "insert" | "update" | "delete",
  payload: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch("/api/excel-db", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ table, action, ...payload }),
  })

  const result = await response.json().catch(() => null)
  if (!response.ok || !result?.success) {
    throw new Error(result?.message || `Excel database request failed: ${table}.${action}`)
  }

  if (typeof window !== "undefined" && ["insert", "update", "delete"].includes(action)) {
    clearListCache(table)
    window.dispatchEvent(
      new CustomEvent("excel-db-change", {
        detail: { table, action, triggeredAt: new Date().toISOString() },
      }),
    )
  }

  return result.data as T
}

function getCachedRows(table: TableName): DbRow[] | null {
  const cached = listCache.get(table)
  if (!cached || cached.expiresAt < Date.now()) {
    listCache.delete(table)
    return null
  }
  return cached.rows
}

function setCachedRows(table: TableName, rows: DbRow[]): void {
  listCache.set(table, {
    rows,
    expiresAt: Date.now() + listCacheTtlMs,
  })
}

function clearListCache(table?: TableName): void {
  if (table) {
    listCache.delete(table)
  } else {
    listCache.clear()
  }
  snapshotRequest = null
}

async function loadSnapshot(): Promise<Record<TableName, DbRow[]>> {
  if (!snapshotRequest) {
    snapshotRequest = fetch("/api/excel-db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "batchList", tables: tableNames }),
    })
      .then(async (response) => {
        const result = await response.json().catch(() => null)
        if (!response.ok || !result?.success) {
          throw new Error(result?.message || "Excel database batch request failed")
        }
        return result.data as Record<TableName, DbRow[]>
      })
      .then((snapshot) => {
        for (const table of tableNames) {
          setCachedRows(table, Array.isArray(snapshot[table]) ? snapshot[table] : [])
        }
        return snapshot
      })
      .finally(() => {
        snapshotRequest = null
      })
  }

  return snapshotRequest
}

async function listRows(table: TableName): Promise<DbRow[]> {
  const cached = getCachedRows(table)
  if (cached) return cached

  try {
    const snapshot = await loadSnapshot()
    return Array.isArray(snapshot[table]) ? snapshot[table] : []
  } catch (error) {
    console.warn("Batch database load failed, falling back to single-table load:", error)
    const rows = await excelRequest<DbRow[]>(table, "list")
    setCachedRows(table, rows)
    return rows
  }
}

async function getRow(table: TableName, id: string | number): Promise<DbRow | null> {
  const cached = getCachedRows(table)
  if (cached) {
    const primaryKey = table === "payment"
      ? "payment_id"
      : table === "scan_logs" || table === "subscription_history" || table === "user_id_counter"
        ? "id"
        : "user_id"
    return cached.find((row) => String(row[primaryKey] ?? "") === String(id)) || null
  }

  return excelRequest<DbRow | null>(table, "get", { id })
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  return String(value ?? "").toLowerCase() === "true"
}

function byDateDesc(field: string) {
  return (left: DbRow, right: DbRow) =>
    new Date(right[field] || 0).getTime() - new Date(left[field] || 0).getTime()
}

function userFromRow(row: DbRow): User {
  return {
    userId: String(row.user_id),
    name: row.name || "",
    email: row.email || undefined,
    phone: row.phone || undefined,
    birthday: row.birthday || undefined,
    age: toNumber(row.age),
    address: row.address || undefined,
    goal: row.goal || undefined,
    programType: row.program_type || undefined,
    heightCm: toNumber(row.height_cm),
    weightKg: toNumber(row.weight_kg),
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
  }
}

function userToRow(user: User): DbRow {
  return {
    user_id: user.userId,
    name: user.name,
    email: user.email || null,
    phone: user.phone || null,
    birthday: user.birthday || null,
    age: user.age || null,
    address: user.address || null,
    goal: user.goal || null,
    program_type: user.programType || null,
    height_cm: user.heightCm || null,
    weight_kg: user.weightKg || null,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  }
}

function subscriptionFromRow(row: DbRow): Subscription {
  return {
    userId: String(row.user_id),
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    planDuration: row.plan_duration || null,
    membershipType: row.membership_type || undefined,
    coachingPreference: toBoolean(row.coaching_preference),
    paymentStatus: row.payment_status || undefined,
    paymentDate: row.payment_date || undefined,
    createdAt: row.created_at || new Date().toISOString(),
  }
}

function subscriptionToRow(subscription: Subscription): DbRow {
  return {
    user_id: subscription.userId,
    start_date: subscription.startDate,
    end_date: subscription.endDate,
    status: subscription.status,
    plan_duration: subscription.planDuration || null,
    membership_type: subscription.membershipType || null,
    coaching_preference: subscription.coachingPreference ?? false,
    payment_status: subscription.paymentStatus ?? "not paid",
    payment_date: subscription.paymentDate || null,
    created_at: subscription.createdAt,
  }
}

function medicalHistoryFromRow(row: DbRow): MedicalHistory {
  return {
    userId: String(row.user_id),
    heartProblems: toBoolean(row.heart_problems),
    bloodPressureProblems: toBoolean(row.blood_pressure_problems),
    chestPainExercising: toBoolean(row.chest_pain_exercising),
    asthmaBreathingProblems: toBoolean(row.asthma_breathing_problems),
    jointProblems: toBoolean(row.joint_problems),
    neckBackProblems: toBoolean(row.neck_back_problems),
    pregnantRecentBirth: toBoolean(row.pregnant_recent_birth),
    otherMedicalConditions: toBoolean(row.other_medical_conditions),
    otherMedicalDetails: row.other_medical_details || undefined,
    smoking: toBoolean(row.smoking),
    medication: toBoolean(row.medication),
    medicationDetails: row.medication_details || undefined,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
  }
}

function medicalHistoryToRow(medicalHistory: MedicalHistory): DbRow {
  return {
    user_id: medicalHistory.userId,
    heart_problems: medicalHistory.heartProblems,
    blood_pressure_problems: medicalHistory.bloodPressureProblems,
    chest_pain_exercising: medicalHistory.chestPainExercising,
    asthma_breathing_problems: medicalHistory.asthmaBreathingProblems,
    joint_problems: medicalHistory.jointProblems,
    neck_back_problems: medicalHistory.neckBackProblems,
    pregnant_recent_birth: medicalHistory.pregnantRecentBirth,
    other_medical_conditions: medicalHistory.otherMedicalConditions,
    other_medical_details: medicalHistory.otherMedicalDetails || null,
    smoking: medicalHistory.smoking,
    medication: medicalHistory.medication,
    medication_details: medicalHistory.medicationDetails || null,
    created_at: medicalHistory.createdAt,
    updated_at: medicalHistory.updatedAt,
  }
}

function emergencyContactFromRow(row: DbRow): EmergencyContact {
  return {
    userId: String(row.user_id),
    contactName: row.contact_name || "",
    contactNumber: row.contact_number || "",
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
  }
}

function emergencyContactToRow(contact: EmergencyContact): DbRow {
  return {
    user_id: contact.userId,
    contact_name: contact.contactName,
    contact_number: contact.contactNumber,
    created_at: contact.createdAt,
    updated_at: contact.updatedAt,
  }
}

function liabilityWaiverFromRow(row: DbRow): LiabilityWaiver {
  return {
    userId: String(row.user_id),
    signatureName: row.signature_name || "",
    signedDate: row.signed_date || "",
    waiverAccepted: toBoolean(row.waiver_accepted),
    createdAt: row.created_at || new Date().toISOString(),
  }
}

function liabilityWaiverToRow(waiver: LiabilityWaiver): DbRow {
  return {
    user_id: waiver.userId,
    signature_name: waiver.signatureName,
    signed_date: waiver.signedDate,
    waiver_accepted: waiver.waiverAccepted,
    created_at: waiver.createdAt,
  }
}

function scanLogFromRow(row: DbRow): ScanLog {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    userName: row.user_name || "",
    timestamp: row.timestamp || "",
    action: row.action,
    status: row.status,
  }
}

function scanLogToRow(log: ScanLog): DbRow {
  return {
    id: log.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    user_id: log.userId,
    user_name: log.userName,
    timestamp: log.timestamp,
    action: log.action,
    status: log.status,
  }
}

function activeSessionFromRow(row: DbRow): ActiveSession {
  return {
    userId: String(row.user_id),
    userName: row.user_name || "",
    checkInTime: row.check_in_time || "",
  }
}

function activeSessionToRow(session: ActiveSession): DbRow {
  return {
    user_id: session.userId,
    user_name: session.userName,
    check_in_time: session.checkInTime,
  }
}

function subscriptionHistoryFromRow(row: DbRow): SubscriptionHistory {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
  }
}

function subscriptionHistoryToRow(history: SubscriptionHistory): DbRow {
  return {
    id: history.id,
    user_id: history.userId,
    start_date: history.startDate,
    end_date: history.endDate,
    status: history.status,
    created_at: history.createdAt,
    updated_at: history.updatedAt,
  }
}

function paymentFromRow(row: DbRow): Payment {
  return {
    paymentId: String(row.payment_id),
    userId: String(row.user_id),
    amount: Number(row.amount || 0),
    paymentMethod: row.payment_method,
    paymentDate: row.payment_date,
    referenceNumber: row.reference_number || undefined,
    notes: row.notes || undefined,
    paymentFor: row.payment_for,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
  }
}

function paymentToRow(payment: Payment): DbRow {
  return {
    payment_id: payment.paymentId,
    user_id: payment.userId,
    amount: payment.amount,
    payment_method: payment.paymentMethod,
    payment_date: payment.paymentDate,
    reference_number: payment.referenceNumber || null,
    notes: payment.notes || null,
    payment_for: payment.paymentFor,
    created_at: payment.createdAt,
    updated_at: payment.updatedAt,
  }
}

export async function getUsers(): Promise<User[]> {
  try {
    const users = (await listRows("users")).sort(byDateDesc("created_at")).map(userFromRow)
    offlineCache.cacheUsers(users)
    return users
  } catch (error) {
    console.error("Error fetching users:", error)
    return offlineCache.getCachedUsers()
  }
}

export async function getUserById(userId: string): Promise<User | null> {
  try {
    const row = await getRow("users", userId)
    if (!row) return offlineCache.getCachedUser(userId)
    const user = userFromRow(row)
    offlineCache.cacheUser(user)
    return user
  } catch {
    return offlineCache.getCachedUser(userId)
  }
}

export async function addUser(user: User): Promise<void> {
  await excelRequest("users", "insert", { row: userToRow(user) })
  offlineCache.cacheUser(user)
}

export async function updateUser(userId: string, updates: Partial<User>): Promise<void> {
  const current = await getUserById(userId)
  if (!current) return
  const updated = { ...current, ...updates, updatedAt: new Date().toISOString() }
  await excelRequest("users", "update", { id: userId, updates: userToRow(updated) })
  offlineCache.cacheUser(updated)
}

export async function deleteUser(userId: string): Promise<void> {
  await excelRequest("users", "delete", { id: userId })
}

export async function getSubscriptions(): Promise<Subscription[]> {
  try {
    const subscriptions = (await listRows("subscriptions")).map(subscriptionFromRow)
    offlineCache.cacheSubscriptions(subscriptions)
    return subscriptions
  } catch {
    return offlineCache.getCachedSubscriptions()
  }
}

export async function getSubscriptionByUserId(userId: string): Promise<Subscription | null> {
  try {
    const row = await getRow("subscriptions", userId)
    if (!row) return offlineCache.getCachedSubscription(userId)
    const subscription = subscriptionFromRow(row)
    offlineCache.cacheSubscription(subscription)
    return subscription
  } catch {
    return offlineCache.getCachedSubscription(userId)
  }
}

export async function addOrUpdateSubscription(subscription: Subscription): Promise<void> {
  const existing = await getSubscriptionByUserId(subscription.userId)

  if (existing) {
    await archiveSubscription(existing)
    await excelRequest("subscriptions", "update", {
      id: subscription.userId,
      updates: subscriptionToRow(subscription),
    })
  } else {
    await excelRequest("subscriptions", "insert", { row: subscriptionToRow(subscription) })
  }

  offlineCache.cacheSubscription(subscription)
}

export async function getMedicalHistory(userId: string): Promise<MedicalHistory | null> {
  const row = await getRow("medical_history", userId)
  return row ? medicalHistoryFromRow(row) : null
}

export async function addMedicalHistory(medicalHistory: MedicalHistory): Promise<void> {
  await excelRequest("medical_history", "insert", { row: medicalHistoryToRow(medicalHistory) })
}

export async function updateMedicalHistory(
  userId: string,
  updates: Partial<MedicalHistory>,
): Promise<void> {
  const current = await getMedicalHistory(userId)
  if (!current) return
  const updated = { ...current, ...updates, updatedAt: new Date().toISOString() }
  await excelRequest("medical_history", "update", {
    id: userId,
    updates: medicalHistoryToRow(updated),
  })
}

export async function getEmergencyContact(userId: string): Promise<EmergencyContact | null> {
  const row = await getRow("emergency_contacts", userId)
  return row ? emergencyContactFromRow(row) : null
}

export async function addEmergencyContact(emergencyContact: EmergencyContact): Promise<void> {
  await excelRequest("emergency_contacts", "insert", {
    row: emergencyContactToRow(emergencyContact),
  })
}

export async function updateEmergencyContact(
  userId: string,
  updates: Partial<EmergencyContact>,
): Promise<void> {
  const current = await getEmergencyContact(userId)
  if (!current) return
  const updated = { ...current, ...updates, updatedAt: new Date().toISOString() }
  await excelRequest("emergency_contacts", "update", {
    id: userId,
    updates: emergencyContactToRow(updated),
  })
}

export async function getLiabilityWaiver(userId: string): Promise<LiabilityWaiver | null> {
  const row = await getRow("liability_waivers", userId)
  return row ? liabilityWaiverFromRow(row) : null
}

export async function addLiabilityWaiver(liabilityWaiver: LiabilityWaiver): Promise<void> {
  await excelRequest("liability_waivers", "insert", {
    row: liabilityWaiverToRow(liabilityWaiver),
  })
}

export async function getScanLogs(): Promise<ScanLog[]> {
  return (await listRows("scan_logs")).sort(byDateDesc("timestamp")).map(scanLogFromRow)
}

export async function addScanLog(log: ScanLog): Promise<void> {
  if (!log.userId || !log.action || !log.status || !log.timestamp) return

  const row = scanLogToRow(log)
  try {
    await excelRequest("scan_logs", "insert", { row })
  } catch (error) {
    console.error("Error adding scan log, queuing offline:", error)
    offlineQueue.enqueue("scan_logs", "insert", row)
  }
}

export async function getTodayScanLogs(): Promise<ScanLog[]> {
  const nowPH = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" })
  const todayPH = new Date(nowPH)
  const startOfDayPH = new Date(todayPH)
  startOfDayPH.setHours(0, 0, 0, 0)
  const endOfDayPH = new Date(todayPH)
  endOfDayPH.setHours(23, 59, 59, 999)

  return (await getScanLogs()).filter((log) => {
    const timestamp = new Date(log.timestamp).getTime()
    return timestamp >= startOfDayPH.getTime() && timestamp <= endOfDayPH.getTime()
  })
}

export async function getScanLogsByUserId(userId: string): Promise<ScanLog[]> {
  return (await getScanLogs()).filter((log) => log.userId === userId)
}

export async function getActiveSessionByUserId(userId: string): Promise<ActiveSession | null> {
  try {
    const row = await getRow("active_sessions", userId)
    if (!row) return offlineCache.getCachedActiveSession(userId)
    const session = activeSessionFromRow(row)
    offlineCache.updateCachedSession(userId, session)
    return session
  } catch {
    return offlineCache.getCachedActiveSession(userId)
  }
}

export async function getActiveSessions(): Promise<ActiveSession[]> {
  try {
    const sessions = (await listRows("active_sessions"))
      .sort(byDateDesc("check_in_time"))
      .map(activeSessionFromRow)
    offlineCache.cacheActiveSessions(sessions)
    return sessions
  } catch {
    return offlineCache.getCachedActiveSessions()
  }
}

export async function isUserCheckedIn(userId: string): Promise<boolean> {
  return !!(await getActiveSessionByUserId(userId))
}

export async function startSession(session: ActiveSession): Promise<void> {
  const row = activeSessionToRow(session)
  try {
    await excelRequest("active_sessions", "insert", { row })
  } catch (error) {
    console.error("Error starting session, queuing offline:", error)
    offlineQueue.enqueue("active_sessions", "insert", row)
  }
  offlineCache.updateCachedSession(session.userId, session)
}

export async function endSession(userId: string): Promise<ActiveSession | null> {
  const session = await getActiveSessionByUserId(userId)
  if (!session) return null

  try {
    await excelRequest("active_sessions", "delete", { id: userId })
  } catch (error) {
    console.error("Error ending session, queuing offline:", error)
    offlineQueue.enqueue("active_sessions", "delete", {
      _deleteKey: "user_id",
      _deleteValue: userId,
    })
  }

  offlineCache.updateCachedSession(userId, null)
  return session
}

export async function generateUserId(): Promise<string> {
  const counter = await getUserIdCounter()
  const currentLastNumber = counter?.lastNumber || 1000
  const next = currentLastNumber + 1

  if (counter) {
    await excelRequest("user_id_counter", "update", { id: counter.id, updates: { last_number: next } })
  } else {
    await excelRequest("user_id_counter", "insert", { row: { id: 1, last_number: next } })
  }

  return `BCF-${next}`
}

export async function getSubscriptionHistory(
  userId?: string,
): Promise<SubscriptionHistory[]> {
  const history = (await listRows("subscription_history"))
    .sort(byDateDesc("created_at"))
    .map(subscriptionHistoryFromRow)
  return userId ? history.filter((item) => item.userId === userId) : history
}

export async function archiveSubscription(subscription: Subscription): Promise<void> {
  const archivedStatus = subscription.status === "cancelled" ? "cancelled" : "expired"
  await excelRequest("subscription_history", "insert", {
    row: subscriptionHistoryToRow({
      id: `${subscription.userId}-${Date.now()}`,
      userId: subscription.userId,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      status: archivedStatus,
      createdAt: subscription.createdAt,
      updatedAt: new Date().toISOString(),
    }),
  })
}

export async function addUsers(users: User[]): Promise<void> {
  await excelRequest("users", "insert", { rows: users.map(userToRow) })
  offlineCache.cacheUsers(users)
}

export async function getAllMedicalHistories(): Promise<MedicalHistory[]> {
  return (await listRows("medical_history")).map(medicalHistoryFromRow)
}

export async function getAllEmergencyContacts(): Promise<EmergencyContact[]> {
  return (await listRows("emergency_contacts")).map(emergencyContactFromRow)
}

export async function getAllLiabilityWaivers(): Promise<LiabilityWaiver[]> {
  return (await listRows("liability_waivers")).map(liabilityWaiverFromRow)
}

export async function getUserIdCounter(): Promise<{ id: number; lastNumber: number } | null> {
  const row = await getRow("user_id_counter", 1)
  if (!row) return null
  return {
    id: Number(row.id || 1),
    lastNumber: Number(row.last_number || 1000),
  }
}

export async function generatePaymentId(): Promise<string> {
  const prefix = "PAY"
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `${prefix}-${timestamp}-${random}`
}

export async function getPayments(): Promise<Payment[]> {
  return (await listRows("payment")).sort(byDateDesc("created_at")).map(paymentFromRow)
}

export async function getPaymentsByUserId(userId: string): Promise<Payment[]> {
  return (await getPayments()).filter((payment) => payment.userId === userId)
}

export async function getPaymentById(paymentId: string): Promise<Payment | null> {
  const row = await getRow("payment", paymentId)
  return row ? paymentFromRow(row) : null
}

export async function addPayment(payment: Payment): Promise<void> {
  await excelRequest("payment", "insert", { row: paymentToRow(payment) })
}

export async function updatePayment(paymentId: string, updates: Partial<Payment>): Promise<void> {
  const current = await getPaymentById(paymentId)
  if (!current) return
  const updated = { ...current, ...updates, updatedAt: new Date().toISOString() }
  await excelRequest("payment", "update", { id: paymentId, updates: paymentToRow(updated) })
}

export async function deletePayment(paymentId: string): Promise<void> {
  await excelRequest("payment", "delete", { id: paymentId })
}

export const storageService = {
  getUsers,
  getUserById,
  addUser,
  updateUser,
  deleteUser,
  getSubscriptions,
  getSubscriptionByUserId,
  addOrUpdateSubscription,
  getMedicalHistory,
  addMedicalHistory,
  updateMedicalHistory,
  getEmergencyContact,
  addEmergencyContact,
  updateEmergencyContact,
  getLiabilityWaiver,
  addLiabilityWaiver,
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
  getAllMedicalHistories,
  getAllEmergencyContacts,
  getAllLiabilityWaivers,
  getUserIdCounter,
  generatePaymentId,
  getPayments,
  getPaymentsByUserId,
  getPaymentById,
  addPayment,
  updatePayment,
  deletePayment,
}

export * as storage from "./storage.service"
