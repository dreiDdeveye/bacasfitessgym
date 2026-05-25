"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { storageService } from "@/src/services/storage.service"

/* ---------------- TYPES ---------------- */

type ScanStatus = "valid" | "expired" | "inactive" | "not_found"

interface ScanResult {
  status: ScanStatus
  message: string
  subscription?: {
    userId: string
    startDate: string
    endDate: string
    status: string
  }
}

interface QRScannerHook {
  scannedCode: string
  isScanning: boolean
  isProcessing: boolean
  scanResult: ScanResult | null
  resetScanner: () => void
}

/* ---------------- HOOK ---------------- */

export function useQRScanner(
  onScan: (code: string, result: ScanResult) => void | Promise<void>,
  debounceMs = 500
): QRScannerHook {
  const [scannedCode, setScannedCode] = useState("")
  const [isScanning, setIsScanning] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)

  const bufferRef = useRef("")
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastScanRef = useRef<number>(0)
  const isProcessingRef = useRef(false)

  /* ---------------- RESET ---------------- */

  const resetScanner = useCallback(() => {
    setScannedCode("")
    setIsScanning(false)
    setScanResult(null)
    bufferRef.current = ""
  }, [])

  /* ---------------- VALIDATION ---------------- */

  const validateSubscription = async (userId: string): Promise<ScanResult> => {
    const subscription = await storageService.getSubscriptionByUserId(userId)

    if (!subscription) {
      return {
        status: "not_found",
        message: "No subscription found",
      }
    }

    if (subscription.status !== "active") {
      return {
        status: "inactive",
        message: "Subscription inactive",
        subscription,
      }
    }

    const now = new Date()
    const endDate = new Date(subscription.endDate)

    if (now > endDate) {
      return {
        status: "expired",
        message: "Subscription expired",
        subscription,
      }
    }

    return {
      status: "valid",
      message: "Access granted",
      subscription,
    }
  }

  /* ---------------- KEYBOARD SCAN ---------------- */

  useEffect(() => {
    const handleKeyPress = async (e: KeyboardEvent) => {
      if (isProcessingRef.current) {
        bufferRef.current = ""
        return
      }

      // Ignore typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      // ENTER = scan finished
      if (e.key === "Enter") {
        const code = bufferRef.current.trim()
        bufferRef.current = ""

        const now = Date.now()
        if (!code || now - lastScanRef.current < debounceMs) return

        lastScanRef.current = now
        isProcessingRef.current = true
        setIsScanning(true)
        setIsProcessing(true)
        setScannedCode(code)

        try {
          const result = await validateSubscription(code)
          setScanResult(result)
          await onScan(code, result)
        } catch (err) {
          console.error("QR scan error:", err)
        } finally {
          isProcessingRef.current = false
          setIsProcessing(false)
          setIsScanning(false)
        }

        setTimeout(resetScanner, 2000)
        return
      }

      // Collect characters
      if (e.key.length === 1) {
        bufferRef.current += e.key

        timeoutRef.current = setTimeout(() => {
          bufferRef.current = ""
        }, 100)
      }
    }

    window.addEventListener("keypress", handleKeyPress)

    return () => {
      window.removeEventListener("keypress", handleKeyPress)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [onScan, debounceMs, resetScanner])

  /* ---------------- RETURN ---------------- */

  return {
    scannedCode,
    isScanning,
    isProcessing,
    scanResult,
    resetScanner,
  }
}
