"use client"

import type { Subscription, AccessValidation } from "@/src/types"
import * as storage from "./storage.service"

export function isSubscriptionActive(subscription: Subscription | null): boolean {
  if (!subscription) return false
  const now = new Date()
  const endDate = new Date(subscription.endDate)
  return subscription.status === "active" && endDate >= now
}

export function createSubscription(userId: string, durationMonths = 1): Subscription {
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

export async function validateAccess(userId: string): Promise<AccessValidation> {
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

export async function renewSubscription(userId: string, durationMonths = 1): Promise<Subscription> {
  const newSubscription = createSubscription(userId, durationMonths)
  await storage.addOrUpdateSubscription(newSubscription)
  return newSubscription
}

export function getRemainingDays(subscription: Subscription | null): number {
  if (!subscription) return 0
  const now = new Date()
  const endDate = new Date(subscription.endDate)
  const diffTime = endDate.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return Math.max(0, diffDays)
}

export function isExpiringSoon(subscription: Subscription | null, daysThreshold = 7): boolean {
  if (!subscription || subscription.status !== "active") return false
  const remainingDays = getRemainingDays(subscription)
  return remainingDays > 0 && remainingDays <= daysThreshold
}

export async function getUsersWithExpiringSubs(daysThreshold = 7): Promise<string[]> {
  const subscriptions = await storage.getSubscriptions()
  return subscriptions.filter((sub) => isExpiringSoon(sub, daysThreshold)).map((sub) => sub.userId)
}

export const subscriptionService = {
  isSubscriptionActive,
  createSubscription,
  validateAccess,
  renewSubscription,
  getRemainingDays,
  isExpiringSoon,
  getUsersWithExpiringSubs,
}

export * as subscription from "./subscription.service"
