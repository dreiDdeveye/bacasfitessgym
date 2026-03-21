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
import { supabase } from "./supabase"
import { offlineCache } from "./offline-cache.service"
import { offlineQueue } from "./offline-queue.service"

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
    return offlineCache.getCachedUsers()
  }

  const users = (data || []).map((user) => ({
    userId: user.user_id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    birthday: user.birthday,
    age: user.age,
    address: user.address,
    goal: user.goal,
    programType: user.program_type,
    heightCm: user.height_cm,
    weightKg: user.weight_kg,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  }))
  offlineCache.cacheUsers(users)
  return users
}

export async function getUserById(userId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  if (error || !data) {
    return offlineCache.getCachedUser(userId)
  }

  const user: User = {
    userId: data.user_id,
    name: data.name,
    email: data.email,
    phone: data.phone,
    birthday: data.birthday,
    age: data.age,
    address: data.address,
    goal: data.goal,
    programType: data.program_type,
    heightCm: data.height_cm,
    weightKg: data.weight_kg,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
  offlineCache.cacheUser(user)
  return user
}

export async function addUser(user: User): Promise<void> {
  const insertData = {
    user_id: user.userId,
    name: user.name,
    email: user.email,
    phone: user.phone,
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

  console.log("Inserting user:", insertData)

  const { data, error } = await supabase
    .from("users")
    .insert([insertData])
    .select()

  if (error) {
    console.error("Error adding user:", JSON.stringify(error, null, 2))
    console.error("Error details:", error)
    throw new Error(`User insert failed: ${error.message || JSON.stringify(error)}`)
  }

  console.log("User created successfully:", data)
}

export async function updateUser(
  userId: string,
  updates: Partial<User>,
): Promise<void> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.email !== undefined) updateData.email = updates.email
  if (updates.phone !== undefined) updateData.phone = updates.phone
  if (updates.birthday !== undefined) updateData.birthday = updates.birthday || null
  if (updates.age !== undefined) updateData.age = updates.age || null
  if (updates.address !== undefined) updateData.address = updates.address || null
  if (updates.goal !== undefined) updateData.goal = updates.goal || null
  if (updates.programType !== undefined) updateData.program_type = updates.programType || null
  if (updates.heightCm !== undefined) updateData.height_cm = updates.heightCm || null
  if (updates.weightKg !== undefined) updateData.weight_kg = updates.weightKg || null

  const { error } = await supabase
    .from("users")
    .update(updateData)
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
  if (error) return offlineCache.getCachedSubscriptions()

  const subs = (data || []).map((sub) => ({
    userId: sub.user_id,
    startDate: sub.start_date,
    endDate: sub.end_date,
    status: sub.status,
    planDuration: sub.plan_duration,
    membershipType: sub.membership_type,
    coachingPreference: sub.coaching_preference,
    paymentStatus: sub.payment_status,
    paymentDate: sub.payment_date,
    createdAt: sub.created_at,
  }))
  offlineCache.cacheSubscriptions(subs)
  return subs
}

export async function getSubscriptionByUserId(
  userId: string,
): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  if (error || !data) {
    return offlineCache.getCachedSubscription(userId)
  }

  const sub: Subscription = {
    userId: data.user_id,
    startDate: data.start_date,
    endDate: data.end_date,
    status: data.status,
    planDuration: data.plan_duration,
    membershipType: data.membership_type,
    coachingPreference: data.coaching_preference,
    paymentStatus: data.payment_status,
    paymentDate: data.payment_date,
    createdAt: data.created_at,
  }
  offlineCache.cacheSubscription(sub)
  return sub
}

export async function addOrUpdateSubscription(
  subscription: Subscription,
): Promise<void> {
  const existing = await getSubscriptionByUserId(subscription.userId)

  if (existing) {
    await archiveSubscription(existing)

    const updateData = {
      start_date: subscription.startDate,
      end_date: subscription.endDate,
      status: subscription.status,
      plan_duration: subscription.planDuration || null,
      membership_type: subscription.membershipType || null,
      coaching_preference: subscription.coachingPreference ?? false,
      payment_status: subscription.paymentStatus ?? "not paid",
      payment_date: subscription.paymentDate || null,
    }

    console.log("Updating subscription:", updateData)

    const { data, error } = await supabase
      .from("subscriptions")
      .update(updateData)
      .eq("user_id", subscription.userId)
      .select()

    if (error) {
      console.error("Error updating subscription:", JSON.stringify(error, null, 2))
      throw new Error(`Subscription update failed: ${error.message || JSON.stringify(error)}`)
    }
  } else {
    const insertData = {
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

    console.log("Inserting subscription:", insertData)

    const { data, error } = await supabase
      .from("subscriptions")
      .insert([insertData])
      .select()

    if (error) {
      console.error("Error adding subscription:", JSON.stringify(error, null, 2))
      console.error("Error details:", error)
      throw new Error(`Subscription insert failed: ${error.message || JSON.stringify(error)}`)
    }

    console.log("Subscription created successfully:", data)
  }
}

//
// ==============================
// MEDICAL HISTORY
// ==============================
//

export async function getMedicalHistory(
  userId: string,
): Promise<MedicalHistory | null> {
  const { data, error } = await supabase
    .from("medical_history")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  if (error || !data) return null

  return {
    userId: data.user_id,
    heartProblems: data.heart_problems,
    bloodPressureProblems: data.blood_pressure_problems,
    chestPainExercising: data.chest_pain_exercising,
    asthmaBreathingProblems: data.asthma_breathing_problems,
    jointProblems: data.joint_problems,
    neckBackProblems: data.neck_back_problems,
    pregnantRecentBirth: data.pregnant_recent_birth,
    otherMedicalConditions: data.other_medical_conditions,
    otherMedicalDetails: data.other_medical_details,
    smoking: data.smoking,
    medication: data.medication,
    medicationDetails: data.medication_details,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}

export async function addMedicalHistory(
  medicalHistory: MedicalHistory,
): Promise<void> {
  const insertData = {
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

  const { data, error } = await supabase
    .from("medical_history")
    .insert([insertData])
    .select()

  if (error) {
    console.error("Error adding medical history:", JSON.stringify(error, null, 2))
    throw new Error(`Medical history insert failed: ${error.message || JSON.stringify(error)}`)
  }
}

export async function updateMedicalHistory(
  userId: string,
  updates: Partial<MedicalHistory>,
): Promise<void> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (updates.heartProblems !== undefined) updateData.heart_problems = updates.heartProblems
  if (updates.bloodPressureProblems !== undefined) updateData.blood_pressure_problems = updates.bloodPressureProblems
  if (updates.chestPainExercising !== undefined) updateData.chest_pain_exercising = updates.chestPainExercising
  if (updates.asthmaBreathingProblems !== undefined) updateData.asthma_breathing_problems = updates.asthmaBreathingProblems
  if (updates.jointProblems !== undefined) updateData.joint_problems = updates.jointProblems
  if (updates.neckBackProblems !== undefined) updateData.neck_back_problems = updates.neckBackProblems
  if (updates.pregnantRecentBirth !== undefined) updateData.pregnant_recent_birth = updates.pregnantRecentBirth
  if (updates.otherMedicalConditions !== undefined) updateData.other_medical_conditions = updates.otherMedicalConditions
  if (updates.otherMedicalDetails !== undefined) updateData.other_medical_details = updates.otherMedicalDetails || null
  if (updates.smoking !== undefined) updateData.smoking = updates.smoking
  if (updates.medication !== undefined) updateData.medication = updates.medication
  if (updates.medicationDetails !== undefined) updateData.medication_details = updates.medicationDetails || null

  const { error } = await supabase
    .from("medical_history")
    .update(updateData)
    .eq("user_id", userId)

  if (error) console.error("Error updating medical history:", error)
}

//
// ==============================
// EMERGENCY CONTACTS
// ==============================
//

export async function getEmergencyContact(
  userId: string,
): Promise<EmergencyContact | null> {
  const { data, error } = await supabase
    .from("emergency_contacts")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  if (error || !data) return null

  return {
    userId: data.user_id,
    contactName: data.contact_name,
    contactNumber: data.contact_number,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}

export async function addEmergencyContact(
  emergencyContact: EmergencyContact,
): Promise<void> {
  const insertData = {
    user_id: emergencyContact.userId,
    contact_name: emergencyContact.contactName,
    contact_number: emergencyContact.contactNumber,
    created_at: emergencyContact.createdAt,
    updated_at: emergencyContact.updatedAt,
  }

  const { data, error } = await supabase
    .from("emergency_contacts")
    .insert([insertData])
    .select()

  if (error) {
    console.error("Error adding emergency contact:", JSON.stringify(error, null, 2))
    throw new Error(`Emergency contact insert failed: ${error.message || JSON.stringify(error)}`)
  }
}

export async function updateEmergencyContact(
  userId: string,
  updates: Partial<EmergencyContact>,
): Promise<void> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (updates.contactName !== undefined) updateData.contact_name = updates.contactName
  if (updates.contactNumber !== undefined) updateData.contact_number = updates.contactNumber

  const { error } = await supabase
    .from("emergency_contacts")
    .update(updateData)
    .eq("user_id", userId)

  if (error) console.error("Error updating emergency contact:", error)
}

//
// ==============================
// LIABILITY WAIVERS
// ==============================
//

export async function getLiabilityWaiver(
  userId: string,
): Promise<LiabilityWaiver | null> {
  const { data, error } = await supabase
    .from("liability_waivers")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  if (error || !data) return null

  return {
    userId: data.user_id,
    signatureName: data.signature_name,
    signedDate: data.signed_date,
    waiverAccepted: data.waiver_accepted,
    createdAt: data.created_at,
  }
}

export async function addLiabilityWaiver(
  liabilityWaiver: LiabilityWaiver,
): Promise<void> {
  const insertData = {
    user_id: liabilityWaiver.userId,
    signature_name: liabilityWaiver.signatureName,
    signed_date: liabilityWaiver.signedDate,
    waiver_accepted: liabilityWaiver.waiverAccepted,
    created_at: liabilityWaiver.createdAt,
  }

  const { data, error } = await supabase
    .from("liability_waivers")
    .insert([insertData])
    .select()

  if (error) {
    console.error("Error adding liability waiver:", JSON.stringify(error, null, 2))
    throw new Error(`Liability waiver insert failed: ${error.message || JSON.stringify(error)}`)
  }
}

//
// ==============================
// SCAN LOGS
// ==============================
//

export async function getScanLogs(): Promise<ScanLog[]> {
  // Fetches ALL logs with no cap using pagination (Supabase default limit is 1000)
  let allLogs: any[] = []
  let from = 0
  const batchSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from("scan_logs")
      .select("*")
      .order("timestamp", { ascending: false })
      .range(from, from + batchSize - 1)

    if (error || !data || data.length === 0) break

    allLogs = allLogs.concat(data)

    if (data.length < batchSize) break // last page reached

    from += batchSize
  }

  return allLogs.map((log) => ({
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

  const insertData = {
    user_id: log.userId,
    user_name: log.userName,
    timestamp: log.timestamp,
    action: log.action,
    status: log.status,
  }

  const { error } = await supabase.from("scan_logs").insert([insertData])

  if (error) {
    console.error("Error adding scan log, queuing offline:", error)
    offlineQueue.enqueue("scan_logs", "insert", insertData)
  }
}

export async function getTodayScanLogs(): Promise<ScanLog[]> {
  const nowPH = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" })
  const todayPH = new Date(nowPH)

  const startOfDayPH = new Date(todayPH)
  startOfDayPH.setHours(0, 0, 0, 0)

  const endOfDayPH = new Date(todayPH)
  endOfDayPH.setHours(23, 59, 59, 999)

  const { data, error } = await supabase
    .from("scan_logs")
    .select("*")
    .gte("timestamp", startOfDayPH.toISOString())
    .lte("timestamp", endOfDayPH.toISOString())
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
// ACTIVE SESSIONS
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

  if (error || !data) {
    return offlineCache.getCachedActiveSession(userId)
  }

  const session: ActiveSession = {
    userId: data.user_id,
    userName: data.user_name,
    checkInTime: data.check_in_time,
  }
  offlineCache.updateCachedSession(userId, session)
  return session
}

export async function getActiveSessions(): Promise<ActiveSession[]> {
  const { data, error } = await supabase
    .from("active_sessions")
    .select("*")
    .order("check_in_time", { ascending: false })

  if (error) return offlineCache.getCachedActiveSessions()

  const sessions = (data || []).map((s) => ({
    userId: s.user_id,
    userName: s.user_name,
    checkInTime: s.check_in_time,
  }))
  offlineCache.cacheActiveSessions(sessions)
  return sessions
}

export async function isUserCheckedIn(userId: string): Promise<boolean> {
  const session = await getActiveSessionByUserId(userId)
  return !!session
}

export async function startSession(session: ActiveSession): Promise<void> {
  const insertData = {
    user_id: session.userId,
    user_name: session.userName,
    check_in_time: session.checkInTime,
  }

  const { error } = await supabase.from("active_sessions").insert([insertData])

  if (error) {
    console.error("Error starting session, queuing offline:", error)
    offlineQueue.enqueue("active_sessions", "insert", insertData)
  }

  // Always update local cache so offline check-in/out flow works
  offlineCache.updateCachedSession(session.userId, session)
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
    console.error("Error ending session, queuing offline:", error)
    offlineQueue.enqueue("active_sessions", "delete", {
      _deleteKey: "user_id",
      _deleteValue: userId,
    })
  }

  // Always update local cache so offline flow works
  offlineCache.updateCachedSession(userId, null)

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
      birthday: u.birthday || null,
      age: u.age || null,
      address: u.address || null,
      goal: u.goal || null,
      program_type: u.programType || null,
      height_cm: u.heightCm || null,
      weight_kg: u.weightKg || null,
      created_at: u.createdAt,
      updated_at: u.updatedAt,
    })),
  )

  if (error) console.error("Error bulk adding users:", error)
}

//
// ==============================
// BULK FETCH (for backup)
// ==============================
//

export async function getAllMedicalHistories(): Promise<MedicalHistory[]> {
  const { data, error } = await supabase
    .from("medical_history")
    .select("*")

  if (error || !data) return []

  return data.map((d) => ({
    userId: d.user_id,
    heartProblems: d.heart_problems,
    bloodPressureProblems: d.blood_pressure_problems,
    chestPainExercising: d.chest_pain_exercising,
    asthmaBreathingProblems: d.asthma_breathing_problems,
    jointProblems: d.joint_problems,
    neckBackProblems: d.neck_back_problems,
    pregnantRecentBirth: d.pregnant_recent_birth,
    otherMedicalConditions: d.other_medical_conditions,
    otherMedicalDetails: d.other_medical_details || undefined,
    smoking: d.smoking,
    medication: d.medication,
    medicationDetails: d.medication_details || undefined,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  }))
}

export async function getAllEmergencyContacts(): Promise<EmergencyContact[]> {
  const { data, error } = await supabase
    .from("emergency_contacts")
    .select("*")

  if (error || !data) return []

  return data.map((d) => ({
    userId: d.user_id,
    contactName: d.contact_name,
    contactNumber: d.contact_number,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  }))
}

export async function getAllLiabilityWaivers(): Promise<LiabilityWaiver[]> {
  const { data, error } = await supabase
    .from("liability_waivers")
    .select("*")

  if (error || !data) return []

  return data.map((d) => ({
    userId: d.user_id,
    signatureName: d.signature_name,
    signedDate: d.signed_date,
    waiverAccepted: d.waiver_accepted,
    createdAt: d.created_at,
  }))
}

export async function getUserIdCounter(): Promise<{ id: number; lastNumber: number } | null> {
  const { data, error } = await supabase
    .from("user_id_counter")
    .select("*")
    .single()

  if (error || !data) return null

  return {
    id: data.id,
    lastNumber: data.last_number,
  }
}

//
// ==============================
// PAYMENTS
// ==============================
//

export async function generatePaymentId(): Promise<string> {
  const prefix = 'PAY'
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `${prefix}-${timestamp}-${random}`
}

export async function getPayments(): Promise<Payment[]> {
  const { data, error } = await supabase
    .from("payment")
    .select("*")
    .order("created_at", { ascending: false })

  if (error || !data) return []

  return data.map((p) => ({
    paymentId: p.payment_id,
    userId: p.user_id,
    amount: p.amount,
    paymentMethod: p.payment_method,
    paymentDate: p.payment_date,
    referenceNumber: p.reference_number,
    notes: p.notes,
    paymentFor: p.payment_for,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }))
}

export async function getPaymentsByUserId(userId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from("payment")
    .select("*")
    .eq("user_id", userId)
    .order("payment_date", { ascending: false })

  if (error || !data) return []

  return data.map((p) => ({
    paymentId: p.payment_id,
    userId: p.user_id,
    amount: p.amount,
    paymentMethod: p.payment_method,
    paymentDate: p.payment_date,
    referenceNumber: p.reference_number,
    notes: p.notes,
    paymentFor: p.payment_for,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }))
}

export async function getPaymentById(paymentId: string): Promise<Payment | null> {
  const { data, error } = await supabase
    .from("payment")
    .select("*")
    .eq("payment_id", paymentId)
    .maybeSingle()

  if (error || !data) return null

  return {
    paymentId: data.payment_id,
    userId: data.user_id,
    amount: data.amount,
    paymentMethod: data.payment_method,
    paymentDate: data.payment_date,
    referenceNumber: data.reference_number,
    notes: data.notes,
    paymentFor: data.payment_for,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}

export async function addPayment(payment: Payment): Promise<void> {
  const insertData = {
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

  console.log("Inserting payment:", insertData)

  const { data, error } = await supabase
    .from("payment")
    .insert([insertData])
    .select()

  if (error) {
    console.error("Error adding payment:", JSON.stringify(error, null, 2))
    console.error("Error details:", error)
    throw new Error(`Payment insert failed: ${error.message || JSON.stringify(error)}`)
  }

  console.log("Payment created successfully:", data)
}

export async function updatePayment(
  paymentId: string,
  updates: Partial<Payment>,
): Promise<void> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (updates.amount !== undefined) updateData.amount = updates.amount
  if (updates.paymentMethod !== undefined) updateData.payment_method = updates.paymentMethod
  if (updates.paymentDate !== undefined) updateData.payment_date = updates.paymentDate
  if (updates.referenceNumber !== undefined) updateData.reference_number = updates.referenceNumber || null
  if (updates.notes !== undefined) updateData.notes = updates.notes || null
  if (updates.paymentFor !== undefined) updateData.payment_for = updates.paymentFor

  const { error } = await supabase
    .from("payment")
    .update(updateData)
    .eq("payment_id", paymentId)

  if (error) console.error("Error updating payment:", error)
}

export async function deletePayment(paymentId: string): Promise<void> {
  const { error } = await supabase
    .from("payment")
    .delete()
    .eq("payment_id", paymentId)

  if (error) console.error("Error deleting payment:", error)
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