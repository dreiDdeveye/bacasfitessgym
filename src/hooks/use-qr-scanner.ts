"use client"

import { useState, useEffect, useCallback, useRef } from "react"

interface QRScannerHook {
  scannedCode: string
  isScanning: boolean
  resetScanner: () => void
}

export function useQRScanner(onScan: (code: string) => void, debounceMs = 500): QRScannerHook {
  const [scannedCode, setScannedCode] = useState("")
  const [isScanning, setIsScanning] = useState(false)
  const bufferRef = useRef("")
  const timeoutRef = useRef<NodeJS.Timeout>()
  const lastScanRef = useRef<number>(0)

  const resetScanner = useCallback(() => {
    setScannedCode("")
    setIsScanning(false)
    bufferRef.current = ""
  }, [])

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      // Clear previous timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      // Enter key indicates end of scan
      if (e.key === "Enter") {
        const code = bufferRef.current.trim()

        // Prevent duplicate scans within debounce period
        const now = Date.now()
        if (code && now - lastScanRef.current > debounceMs) {
          lastScanRef.current = now
          setScannedCode(code)
          setIsScanning(true)
          onScan(code)

          // Reset after scan
          setTimeout(() => {
            resetScanner()
          }, 2000)
        }

        bufferRef.current = ""
        return
      }

      // Add character to buffer
      if (e.key.length === 1) {
        bufferRef.current += e.key

        // Auto-reset buffer after 100ms of no input
        timeoutRef.current = setTimeout(() => {
          bufferRef.current = ""
        }, 100)
      }
    }

    window.addEventListener("keypress", handleKeyPress)

    return () => {
      window.removeEventListener("keypress", handleKeyPress)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [onScan, debounceMs, resetScanner])

  return {
    scannedCode,
    isScanning,
    resetScanner,
  }
}
