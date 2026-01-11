// Domain Types

export interface User {
  userId: string // Format: BCF-XXXX
  name: string
  email: string
  phone: string
  heightCm?: number // Height in centimeters
  weightKg?: number
  createdAt: string
  updatedAt: string
}

export interface Subscription {
  userId: string
  startDate: string
  endDate: string
  status: "active" | "expired" | "cancelled"
  createdAt: string
}

export interface SubscriptionHistory {
  id: string
  userId: string
  startDate: string
  endDate: string
  status: "active" | "expired" | "cancelled"
  createdAt: string
  updatedAt: string
}

// src/types/index.ts
export type ScanLog = {
  id: string
  userId: string
  userName: string
  timestamp: string
  action: "check-in" | "check-out" | "not-applicable"  // include not-applicable
  status: "success" | "expired" | "invalid"
}




export interface ActiveSession {
  userId: string
  userName: string
  checkInTime: string
}

export interface AccessValidation {
  isValid: boolean
  status: "granted" | "expired" | "invalid" | "already-checked-in"
  message: string
  user?: User
  subscription?: Subscription
}
