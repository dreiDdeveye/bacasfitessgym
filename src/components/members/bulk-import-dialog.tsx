"use client"

import type React from "react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"

import { storageService } from "@/src/services/storage.service"
import { subscriptionService } from "@/src/services/subscription.service"

import { Upload, Download, CheckCircle2, AlertCircle } from "lucide-react"
import type { User } from "@/src/types"

interface BulkImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportComplete: () => void
}

interface ImportResult {
  success: boolean
  message: string
  imported: number
  failed: number
  errors: string[]
}

export function BulkImportDialog({
  open,
  onOpenChange,
  onImportComplete,
}: BulkImportDialogProps) {
  const [result, setResult] = useState<ImportResult | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  /* ================================
     DYNAMIC CURRENT MEMBERS CSV DOWNLOAD
  ================================= */
  const downloadCurrentMembers = async () => {
    setIsProcessing(true)
    try {
      const users = await storageService.getUsers()
      if (!users || users.length === 0) {
        alert("No members available to download.")
        return
      }

      // Build CSV header
      const header = [
        "Name",
        "Phone",
        "Email",
        "Subscription Start",
        "Subscription End",
      ]

      // Fetch subscriptions for all users in parallel
      const subscriptions = await Promise.all(
        users.map((user) => storageService.getSubscriptionByUserId(user.userId))
      )

      // Compose rows
      const rows = users.map((user, i) => {
        const sub = subscriptions[i]
        const startDate = sub?.startDate || ""
        const endDate = sub?.endDate || ""

        const escapeCSV = (val: string) =>
          `"${val.replace(/"/g, '""')}"`

        return [
          escapeCSV(user.name),
          escapeCSV(user.phone),
          escapeCSV(user.email),
          escapeCSV(startDate),
          escapeCSV(endDate),
        ].join(",")
      })

      const csvContent = header.join(",") + "\n" + rows.join("\n")

      triggerCSVDownload(csvContent, "current-members.csv")
    } catch (error) {
      alert(
        "Failed to download current members CSV: " +
          (error instanceof Error ? error.message : "Unknown error")
      )
    } finally {
      setIsProcessing(false)
    }
  }

  /* ================================
     HELPER: Trigger CSV download
  ================================= */
  const triggerCSVDownload = (csvContent: string, filename: string) => {
    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = URL.createObjectURL(blob)

    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()

    URL.revokeObjectURL(url)
  }

  /* ================================
     CSV PARSER
  ================================= */
  const parseCSV = (text: string): string[][] => {
    const lines = text.split("\n").filter((l) => l.trim())

    return lines.map((line) => {
      const values: string[] = []
      let current = ""
      let inQuotes = false

      for (let i = 0; i < line.length; i++) {
        const char = line[i]

        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === "," && !inQuotes) {
          values.push(current.trim())
          current = ""
        } else {
          current += char
        }
      }

      values.push(current.trim())
      return values
    })
  }

  /* ================================
     VALIDATORS
  ================================= */
  const validateEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  const validatePhone = (phone: string) =>
    /^\d{10,15}$/.test(phone.replace(/\D/g, ""))

  /* ================================
     FILE UPLOAD HANDLER
  ================================= */
  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsProcessing(true)
    setResult(null)

    try {
      const text = await file.text()
      const rows = parseCSV(text)

      if (rows.length < 2) {
        setResult({
          success: false,
          message: "File has no data",
          imported: 0,
          failed: 0,
          errors: ["CSV is empty"],
        })
        return
      }

      const headers = rows[0].map((h) => h.toLowerCase())
      const nameIndex = headers.findIndex((h) => h.includes("name"))
      const phoneIndex = headers.findIndex((h) => h.includes("phone"))
      const emailIndex = headers.findIndex((h) => h.includes("email"))
      const startIndex = headers.findIndex((h) => h.includes("start"))
      const endIndex = headers.findIndex((h) => h.includes("end"))

      if (nameIndex === -1 || phoneIndex === -1 || emailIndex === -1) {
        setResult({
          success: false,
          message: "Missing required columns",
          imported: 0,
          failed: 0,
          errors: ["Name, Phone, Email columns are required"],
        })
        return
      }

      const usersToInsert: User[] = []
      const errors: string[] = []

      let imported = 0
      let failed = 0

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]

        const name = row[nameIndex]?.trim()
        const phone = row[phoneIndex]?.trim()
        const email = row[emailIndex]?.trim()
        const startDate = row[startIndex]?.trim()
        const endDate = row[endIndex]?.trim()

        if (!name || !phone || !email) {
          errors.push(`Row ${i + 1}: Missing required fields`)
          failed++
          continue
        }

        if (!validateEmail(email)) {
          errors.push(`Row ${i + 1}: Invalid email (${email})`)
          failed++
          continue
        }

        if (!validatePhone(phone)) {
          errors.push(`Row ${i + 1}: Invalid phone (${phone})`)
          failed++
          continue
        }

        const userId = await storageService.generateUserId()
        const now = new Date().toISOString()

        const user: User = {
          userId,
          name,
          email,
          phone,
          createdAt: now,
          updatedAt: now,
        }

        usersToInsert.push(user)

        if (startDate && endDate) {
          await storageService.addOrUpdateSubscription({
            userId,
            startDate,
            endDate,
            status: "active",
            createdAt: now,
          })
        } else {
          const subscription =
            subscriptionService.createSubscription(userId, 1)

          await storageService.addOrUpdateSubscription(subscription)
        }

        imported++
      }

      if (usersToInsert.length > 0) {
        await storageService.addUsers(usersToInsert)
      }

      setResult({
        success: imported > 0,
        message:
          imported > 0
            ? `Successfully imported ${imported} member(s)`
            : "No members imported",
        imported,
        failed,
        errors: errors.slice(0, 10),
      })

      if (imported > 0) {
        setTimeout(() => {
          onImportComplete()
          onOpenChange(false)
        }, 3000)
      }
    } catch (err) {
      setResult({
        success: false,
        message: "Failed to process file",
        imported: 0,
        failed: 0,
        errors: [
          err instanceof Error ? err.message : "Unknown error",
        ],
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleClose = () => {
    setResult(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk User Import</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Alert>
            <AlertDescription>
              Upload CSV with <b>Name, Phone, Email</b>. Subscription
              dates are optional (1 month auto-created).
            </AlertDescription>
          </Alert>

          <Button
            variant="outline"
            onClick={downloadCurrentMembers}
            className="w-full bg-transparent"
            disabled={isProcessing}
          >
            <Download className="w-4 h-4 mr-2" />
            Download Current Members CSV
          </Button>

          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <input
              type="file"
              accept=".csv,.txt"
              onChange={handleFileUpload}
              className="hidden"
              id="csv-upload"
              disabled={isProcessing}
            />
            <label htmlFor="csv-upload" className="cursor-pointer">
              <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm font-medium">
                {isProcessing
                  ? "Processing..."
                  : "Click to upload CSV"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                CSV files only
              </p>
            </label>
          </div>

          {result && (
            <Alert
              variant={result.success ? "default" : "destructive"}
            >
              {result.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                <p className="font-semibold">{result.message}</p>
                <p className="text-sm mt-1">
                  Imported: {result.imported} | Failed:{" "}
                  {result.failed}
                </p>

                {result.errors.length > 0 && (
                  <ul className="mt-2 text-xs list-disc list-inside">
                    {result.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
