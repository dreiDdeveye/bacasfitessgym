"use client"

import type { ScanLog, ActiveSession } from "@/src/types"
import * as storage from "./storage.service"
import * as subscription from "./subscription.service"

const SCAN_COOLDOWN_SECONDS = 60

type AccessResult = {
  success: boolean
  message: string
  log?: ScanLog
  duplicateScan?: {
    userId: string
    userName: string
    cooldownLeft: number
    lastAction: "check-in" | "check-out"
  }
}

async function getRecentSuccessfulScan(userId: string): Promise<ScanLog | null> {
  const logs = await storage.getScanLogsByUserId(userId)
  return logs.find(
    (log) =>
      log.status === "success" &&
      (log.action === "check-in" || log.action === "check-out") &&
      !Number.isNaN(new Date(log.timestamp).getTime())
  ) || null
}

function getCooldownLeft(lastScan: ScanLog, now = Date.now()): number {
  const secondsElapsed = (now - new Date(lastScan.timestamp).getTime()) / 1000
  return Math.max(0, Math.ceil(SCAN_COOLDOWN_SECONDS - secondsElapsed))
}

/**
 * =========================
 * CHECK-IN
 * =========================
 */
export async function processCheckIn(
  userId: string
): Promise<AccessResult> {

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
): Promise<AccessResult> {

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
): Promise<AccessResult> {

  const recentScan = await getRecentSuccessfulScan(userId)
  if (recentScan) {
    const cooldownLeft = getCooldownLeft(recentScan)

    if (cooldownLeft > 0) {
      const lastAction = recentScan.action as "check-in" | "check-out"
      const isCheckedIn = lastAction === "check-in"
      return {
        success: false,
        message: isCheckedIn
          ? `Already checked in. Please wait ${cooldownLeft}s before scanning again.`
          : `Already checked out. Please wait ${cooldownLeft}s before scanning again.`,
        duplicateScan: {
          userId,
          userName: recentScan.userName || userId,
          cooldownLeft,
          lastAction,
        },
      }
    }
  }

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
