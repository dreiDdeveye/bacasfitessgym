"use client"

import type { ScanLog, ActiveSession } from "@/src/types"
import * as storage from "./storage.service"
import * as subscription from "./subscription.service"

/**
 * =========================
 * CHECK-IN
 * =========================
 */
export async function processCheckIn(
  userId: string
): Promise<{ success: boolean; message: string; log?: ScanLog }> {

  const validation = await subscription.validateAccess(userId)

  // ❌ INVALID QR (NO USER)
  if (!validation.user) {
    return {
      success: false,
      message: "Invalid QR Code - User not found",
    }
  }

  // ❌ EXPIRED OR INVALID ACCESS
  if (!validation.isValid) {
    const log: ScanLog = {
      id: crypto.randomUUID(),
      userId,
      userName: validation.user.name,
      action: "not-applicable",
      status: validation.status === "expired" ? "expired" : "invalid",
      timestamp: new Date().toISOString(),
    }

    await storage.addScanLog(log)

    return {
      success: false,
      message: validation.message,
      log,
    }
  }

  // ❌ ALREADY CHECKED IN (SAFETY)
  const existingSession = await storage.getActiveSessionByUserId(userId)
  if (existingSession) {
    return {
      success: false,
      message: "User is already checked in",
    }
  }

  // ✅ START SESSION
  const session: ActiveSession = {
    userId,
    userName: validation.user.name,
    checkInTime: new Date().toISOString(),
  }

  await storage.startSession(session)

  // ✅ SUCCESS LOG
  const log: ScanLog = {
    id: crypto.randomUUID(),
    userId,
    userName: validation.user.name,
    action: "check-in",
    status: "success",
    timestamp: new Date().toISOString(),
  }

  await storage.addScanLog(log)

  return {
    success: true,
    message: `Welcome, ${validation.user.name}!`,
    log,
  }
}

/**
 * =========================
 * CHECK-OUT
 * =========================
 */
export async function processCheckOut(
  userId: string
): Promise<{ success: boolean; message: string; log?: ScanLog }> {

  // 🔹 ONLY CARE ABOUT SESSION
  const session = await storage.getActiveSessionByUserId(userId)

  // ❌ NOT CHECKED IN
  if (!session) {
    return {
      success: false,
      message: "User is not checked in",
    }
  }

  // 🔹 End session
  await storage.endSession(userId)

  // ✅ SUCCESS LOG
  const log: ScanLog = {
    id: crypto.randomUUID(),
    userId,
    userName: session.userName,
    action: "check-out",
    status: "success",
    timestamp: new Date().toISOString(),
  }

  await storage.addScanLog(log)

  return {
    success: true,
    message: `See you Soon, ${session.userName}!`,
    log,
  }
}

/**
 * =========================
 * AUTO IN / OUT (FIXED)
 * =========================
 */
export async function processScan(
  userId: string
): Promise<{ success: boolean; message: string; log?: ScanLog }> {

  // ✅ RULE: SESSION ALWAYS WINS
  const activeSession = await storage.getActiveSessionByUserId(userId)

  if (activeSession) {
    return processCheckOut(userId)
  }

  return processCheckIn(userId)
}

/**
 * =========================
 * EXPORT
 * =========================
 */
export const accessService = {
  processCheckIn,
  processCheckOut,
  processScan,
}
