"use client"

import type { ScanLog, ActiveSession } from "@/src/types"
import * as storage from "./storage.service"
import * as subscription from "./subscription.service"

/**
 * CHECK-IN
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
      action: "not-applicable",  // Use not-applicable here for expired/invalid
      status: validation.status === "expired" ? "expired" : "invalid",
      timestamp: new Date().toISOString(),
    }

    console.log("Adding scan log (expired/invalid):", log)
    await storage.addScanLog(log)

    return {
      success: false,
      message: validation.message,
      log,
    }
  }

  // ❌ ALREADY CHECKED IN
  if (validation.status === "already-checked-in") {
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

  console.log("Adding scan log (check-in):", log)
  await storage.addScanLog(log)

  return {
    success: true,
    message: `Welcome, ${validation.user.name}!`,
    log,
  }
}

/**
 * CHECK-OUT
 */
export async function processCheckOut(
  userId: string
): Promise<{ success: boolean; message: string; log?: ScanLog }> {

  const user = await storage.getUserById(userId)

  // ❌ INVALID QR
  if (!user) {
    return {
      success: false,
      message: "Invalid QR Code - User not found",
    }
  }

  const session = await storage.endSession(userId)

  // ❌ NOT CHECKED IN
  if (!session) {
    return {
      success: false,
      message: "User is not checked in",
    }
  }

  // ✅ SUCCESS LOG
  const log: ScanLog = {
    id: crypto.randomUUID(),
    userId,
    userName: user.name,
    action: "check-out",
    status: "success",
    timestamp: new Date().toISOString(),
  }

  console.log("Adding scan log (check-out):", log)
  await storage.addScanLog(log)

  return {
    success: true,
    message: `Goodbye, ${user.name}!`,
    log,
  }
}

/**
 * AUTO IN / OUT
 */
export async function processScan(
  userId: string
): Promise<{ success: boolean; message: string; log?: ScanLog }> {

  const isCheckedIn = await storage.isUserCheckedIn(userId)

  if (isCheckedIn) {
    return processCheckOut(userId)
  }

  return processCheckIn(userId)
}

export const accessService = {
  processCheckIn,
  processCheckOut,
  processScan,
}
