"use client"

import type { Subscription, AccessValidation } from "@/src/types"
import * as storage from "./storage.service"

function getMonthlyPlanDuration(durationMonths: number): string {
  return `${durationMonths} ${durationMonths === 1 ? "month" : "months"}`
}

/* ================= ACTIVE CHECK ================= */
export function isSubscriptionActive(
  subscription: Subscription | null
): boolean {
  if (!subscription) return false
  const now = new Date()
  const startDate = new Date(subscription.startDate)
  const endDate = new Date(subscription.endDate)
  // Check if subscription is active AND current date is within the valid range
  return subscription.status === "active" && startDate <= now && endDate >= now
}

/* ================= CREATE REGULAR SUB ================= */
export function createSubscription(
  userId: string,
  durationMonths = 1,
  membershipType: Subscription["membershipType"] = "new"
): Subscription {
  const now = new Date()
  const endDate = new Date(now)
  endDate.setMonth(endDate.getMonth() + durationMonths)

  return {
    userId,
    startDate: now.toISOString(),
    endDate: endDate.toISOString(),
    status: "active",
    planDuration: getMonthlyPlanDuration(durationMonths),
    membershipType,
    createdAt: now.toISOString(),
  }
}

/* ================= CREATE DAILY SUB ================= */
export function createDailySubscription(
  userId: string,
  startDate?: Date,
  membershipType: Subscription["membershipType"] = "new"
): Subscription {
  const start = startDate ? new Date(startDate) : new Date()
  const end = new Date(start)

  // Expire at the end of the same day.
  end.setHours(23, 59, 59, 999)

  return {
    userId,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    status: "active",
    planDuration: "daily",
    membershipType,
    createdAt: new Date().toISOString(),
  }
}

/* ================= VALIDATE ACCESS ================= */
export async function validateAccess(
  userId: string
): Promise<AccessValidation> {
  const user = await storage.getUserById(userId)

  if (!user) {
    return {
      isValid: false,
      status: "invalid",
      message: "Invalid QR Code - User not found",
    }
  }

  const subscription = await storage.getSubscriptionByUserId(userId)

  if (!isSubscriptionActive(subscription)) {
    return {
      isValid: false,
      status: "expired",
      message: "Subscription Expired",
      user,
      subscription: subscription || undefined,
    }
  }

  const isCheckedIn = await storage.isUserCheckedIn(userId)

  return {
    isValid: true,
    status: isCheckedIn ? "already-checked-in" : "granted",
    message: isCheckedIn ? "Already Checked In" : "Access Granted",
    user,
    subscription: subscription || undefined,
  }
}

/* ================= RENEW REGULAR ================= */
export async function renewSubscription(
  userId: string,
  durationMonths = 1
): Promise<Subscription> {
  const subscription = createSubscription(userId, durationMonths, "renewal")
  await storage.addOrUpdateSubscription(subscription)
  return subscription
}

/* ================= RENEW WALK-IN ================= */
export async function renewWalkIn(
  userId: string,
  endDate: Date,
  startDate?: Date
): Promise<Subscription> {
  // Use provided start date or default to now
  const start = startDate ? new Date(startDate) : new Date()
  start.setHours(0, 0, 0, 0) // Start at beginning of day

  // Set end time to 11:59:59 PM of the selected end date
  const end = new Date(endDate)
  end.setHours(23, 59, 59, 999)

  const subscription: Subscription = {
    userId,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    status: "active",
    planDuration: "walk-in",
    membershipType: "walk-in",
    createdAt: new Date().toISOString(),
  }

  await storage.addOrUpdateSubscription(subscription)
  return subscription
}

/* ================= RENEW DAILY ================= */
export async function renewDaily(
  userId: string,
  startDate?: Date
): Promise<Subscription> {
  const subscription = createDailySubscription(userId, startDate, "renewal")
  await storage.addOrUpdateSubscription(subscription)
  return subscription
}

/* ================= HELPERS ================= */
export function getRemainingDays(
  subscription: Subscription | null
): number {
  if (!subscription) return 0
  const now = new Date()
  const endDate = new Date(subscription.endDate)
  const diffTime = endDate.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)))
}

export function isExpiringSoon(
  subscription: Subscription | null,
  daysThreshold = 3
): boolean {
  if (!subscription || subscription.status !== "active") return false
  const remaining = getRemainingDays(subscription)
  return remaining > 0 && remaining <= daysThreshold
}

export async function getUsersWithExpiringSubs(
  daysThreshold = 3
): Promise<string[]> {
  const subs = await storage.getSubscriptions()
  return subs
    .filter((s) => isExpiringSoon(s, daysThreshold))
    .map((s) => s.userId)
}

/* ================= EXPORT ================= */
export const subscriptionService = {
  isSubscriptionActive,
  createSubscription,
  createDailySubscription,
  validateAccess,
  renewSubscription,
  renewWalkIn,
  renewDaily,
  getRemainingDays,
  isExpiringSoon,
  getUsersWithExpiringSubs,
}
