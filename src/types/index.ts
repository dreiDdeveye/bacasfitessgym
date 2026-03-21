// Domain Types

export interface User {
  userId: string // Format: BCF-XXXX
  name: string
  email?: string
  phone?: string
  birthday?: string
  age?: number
  address?: string
  goal?: string
  programType?: string
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
  planDuration?: string | null // "1 month" | "6 months" | "12 months" | "daily" | null for walk-ins
  membershipType?: string // "new" | "renewal" | "walk-in"
  coachingPreference?: boolean
  paymentStatus?: string // "paid" | "not paid"
  paymentDate?: string
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

export interface Payment {
  paymentId: string
  userId: string
  amount: number
  paymentMethod: 'cash' | 'gcash' | 'paymaya' | 'banktransfer'
  paymentDate: string
  referenceNumber?: string
  notes?: string
  paymentFor: 'membership' | 'coaching' | 'both' | 'other'
  createdAt: string
  updatedAt: string
}

export interface MedicalHistory {
  userId: string
  heartProblems: boolean
  bloodPressureProblems: boolean
  chestPainExercising: boolean
  asthmaBreathingProblems: boolean
  jointProblems: boolean
  neckBackProblems: boolean
  pregnantRecentBirth: boolean
  otherMedicalConditions: boolean
  otherMedicalDetails?: string
  smoking: boolean
  medication: boolean
  medicationDetails?: string
  createdAt: string
  updatedAt: string
}

export interface EmergencyContact {
  userId: string
  contactName: string
  contactNumber: string
  createdAt: string
  updatedAt: string
}

export interface LiabilityWaiver {
  userId: string
  signatureName: string
  signedDate: string
  waiverAccepted: boolean
  createdAt: string
}

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