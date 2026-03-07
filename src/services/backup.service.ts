"use client"

import {
  getUsers,
  getSubscriptions,
  getSubscriptionHistory,
  getScanLogs,
  getActiveSessions,
  getAllMedicalHistories,
  getAllEmergencyContacts,
  getAllLiabilityWaivers,
  getUserIdCounter,
} from "./storage.service"

interface SheetData {
  sheetName: string
  headers: string[]
  rows: (string | number | boolean | null)[][]
}

export interface BackupProgress {
  step: string
  current: number
  total: number
}

type ProgressCallback = (progress: BackupProgress) => void

const BACKUP_URL_KEY = "bacasfitness_sheets_backup_url"
const LAST_BACKUP_KEY = "bacasfitness_last_backup"

export function getBackupUrl(): string | null {
  return localStorage.getItem(BACKUP_URL_KEY)
}

export function setBackupUrl(url: string): void {
  localStorage.setItem(BACKUP_URL_KEY, url)
}

export function getLastBackup(): string | null {
  return localStorage.getItem(LAST_BACKUP_KEY)
}

function setLastBackup(date: string): void {
  localStorage.setItem(LAST_BACKUP_KEY, date)
}

export async function backupToGoogleSheets(
  scriptUrl: string,
  onProgress?: ProgressCallback,
): Promise<{ success: boolean; message: string; spreadsheetUrl?: string }> {
  const totalSteps = 10
  let currentStep = 0

  const progress = (step: string) => {
    currentStep++
    onProgress?.({ step, current: currentStep, total: totalSteps })
  }

  try {
    // 1. Fetch all data
    progress("Fetching users...")
    const users = await getUsers()

    progress("Fetching subscriptions...")
    const subscriptions = await getSubscriptions()

    progress("Fetching subscription history...")
    const subHistory = await getSubscriptionHistory()

    progress("Fetching scan logs...")
    const scanLogs = await getScanLogs()

    progress("Fetching active sessions...")
    const activeSessions = await getActiveSessions()

    progress("Fetching medical history...")
    const medicalHistories = await getAllMedicalHistories()

    progress("Fetching emergency contacts...")
    const emergencyContacts = await getAllEmergencyContacts()

    progress("Fetching liability waivers...")
    const liabilityWaivers = await getAllLiabilityWaivers()

    progress("Fetching ID counter...")
    const idCounter = await getUserIdCounter()

    // 2. Transform into sheet data
    const sheets: SheetData[] = [
      {
        sheetName: "Users",
        headers: ["User ID", "Name", "Email", "Phone", "Birthday", "Age", "Address", "Goal", "Program Type", "Height (cm)", "Weight (kg)", "Created At", "Updated At"],
        rows: users.map((u) => [
          u.userId, u.name, u.email || null, u.phone || null,
          u.birthday || null, u.age || null, u.address || null,
          u.goal || null, u.programType || null,
          u.heightCm || null, u.weightKg || null,
          u.createdAt, u.updatedAt,
        ]),
      },
      {
        sheetName: "Subscriptions",
        headers: ["User ID", "Start Date", "End Date", "Status", "Plan Duration", "Membership Type", "Coaching Preference", "Payment Status", "Payment Date", "Created At"],
        rows: subscriptions.map((s) => [
          s.userId, s.startDate, s.endDate, s.status,
          s.planDuration || null, s.membershipType || null,
          s.coachingPreference ?? null, s.paymentStatus || null,
          s.paymentDate || null, s.createdAt,
        ]),
      },
      {
        sheetName: "Subscription History",
        headers: ["ID", "User ID", "Start Date", "End Date", "Status", "Created At", "Updated At"],
        rows: subHistory.map((h) => [
          h.id, h.userId, h.startDate, h.endDate, h.status,
          h.createdAt, h.updatedAt,
        ]),
      },
      {
        sheetName: "Scan Logs",
        headers: ["ID", "User ID", "User Name", "Timestamp", "Action", "Status"],
        rows: scanLogs.map((l) => [
          l.id, l.userId, l.userName, l.timestamp, l.action, l.status,
        ]),
      },
      {
        sheetName: "Active Sessions",
        headers: ["User ID", "User Name", "Check-in Time"],
        rows: activeSessions.map((s) => [
          s.userId, s.userName, s.checkInTime,
        ]),
      },
      {
        sheetName: "Medical History",
        headers: ["User ID", "Heart Problems", "Blood Pressure", "Chest Pain", "Asthma/Breathing", "Joint Problems", "Neck/Back", "Pregnant/Recent Birth", "Other Conditions", "Other Details", "Smoking", "Medication", "Medication Details", "Created At", "Updated At"],
        rows: medicalHistories.map((m) => [
          m.userId, m.heartProblems, m.bloodPressureProblems,
          m.chestPainExercising, m.asthmaBreathingProblems,
          m.jointProblems, m.neckBackProblems, m.pregnantRecentBirth,
          m.otherMedicalConditions, m.otherMedicalDetails || null,
          m.smoking, m.medication, m.medicationDetails || null,
          m.createdAt, m.updatedAt,
        ]),
      },
      {
        sheetName: "Emergency Contacts",
        headers: ["User ID", "Contact Name", "Contact Number", "Created At", "Updated At"],
        rows: emergencyContacts.map((e) => [
          e.userId, e.contactName, e.contactNumber, e.createdAt, e.updatedAt,
        ]),
      },
      {
        sheetName: "Liability Waivers",
        headers: ["User ID", "Signature Name", "Signed Date", "Waiver Accepted", "Created At"],
        rows: liabilityWaivers.map((w) => [
          w.userId, w.signatureName, w.signedDate, w.waiverAccepted, w.createdAt,
        ]),
      },
      {
        sheetName: "User ID Counter",
        headers: ["ID", "Last Number"],
        rows: idCounter ? [[idCounter.id, idCounter.lastNumber]] : [],
      },
    ]

    // 3. Send to Google Apps Script
    progress("Uploading to Google Sheets...")

    const totalRecords = sheets.reduce((sum, s) => sum + s.rows.length, 0)

    // Proxy through our API route to avoid CORS issues with Google Apps Script
    const response = await fetch("/api/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scriptUrl,
        sheets,
        metadata: {
          backupDate: new Date().toISOString(),
          totalRecords,
        },
      }),
    })

    const result = await response.json()

    if (result.success) {
      setLastBackup(new Date().toISOString())
    }

    return {
      success: result.success,
      message: result.message || (result.success
        ? `Backup completed successfully (${totalRecords} records)`
        : "Backup failed"),
      spreadsheetUrl: result.spreadsheetUrl,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error occurred"
    return { success: false, message: `Backup failed: ${message}` }
  }
}
