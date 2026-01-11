"use client"

import type { Subscription, AccessValidation } from "@/src/types"
import * as storage from "./storage.service"

/* ================= ACTIVE CHECK ================= */
export function isSubscriptionActive(
  subscription: Subscription | null
): boolean {
  if (!subscription) return false
  const now = new Date()
  const endDate = new Date(subscription.endDate)
  return subscription.status === "active" && endDate >= now
}

/* ================= CREATE SUB ================= */
export function createSubscription(
  userId: string,
  durationMonths = 1
): Subscription {
  const now = new Date()
  const endDate = new Date(now)
  endDate.setMonth(endDate.getMonth() + durationMonths)

  return {
    userId,
    startDate: now.toISOString(),
    endDate: endDate.toISOString(),
    status: "active",
    createdAt: now.toISOString(),
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
  const subscription = createSubscription(userId, durationMonths)
  await storage.addOrUpdateSubscription(subscription)
  return subscription
}

/* ================= RENEW WALK-IN ================= */
export async function renewWalkIn(
  userId: string,
  endDate: Date
): Promise<Subscription> {
  const now = new Date()

  const subscription: Subscription = {
    userId,
    startDate: now.toISOString(),
    endDate: endDate.toISOString(),
    status: "active",
    createdAt: now.toISOString(),
  }

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
  validateAccess,
  renewSubscription,
  renewWalkIn,
  getRemainingDays,
  isExpiringSoon,
  getUsersWithExpiringSubs,
}
