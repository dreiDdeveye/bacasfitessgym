"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScanLine, CheckCircle2, XCircle, Clock } from "lucide-react"
import { useQRScanner } from "@/src/hooks/use-qr-scanner"
import { accessService } from "@/src/services/access.service"
import { storageService } from "@/src/services/storage.service"
import type { ScanLog } from "@/src/types"
import { playExpiredSound } from "@/src/lib/sound"

type ScanResult = {
  success: boolean
  message: string
  log?: ScanLog
}

export function ScannerInterface() {
  const [lastScan, setLastScan] = useState<ScanResult | null>(null)
  const [activeSessions, setActiveSessions] = useState(0)
  const [todayCheckIns, setTodayCheckIns] = useState(0)
  const [totalMembers, setTotalMembers] = useState(0)

  // -------------------------------
  // DASHBOARD COUNTERS
  // -------------------------------

  const updateActiveSessions = async () => {
    const sessions = await storageService.getActiveSessions()
    setActiveSessions(sessions.length)
  }

  const updateTodayCheckIns = async () => {
    const logs = await storageService.getTodayScanLogs()
    setTodayCheckIns(logs.filter((l) => l.action === "check-in").length)
  }

  const updateTotalMembers = async () => {
    const users = await storageService.getUsers()
    setTotalMembers(users.length)
  }

  // -------------------------------
  // HANDLE SCAN (FIXED)
  // -------------------------------

  const handleScan = async (code: string) => {
    const result = await accessService.processScan(code)

    // 🔊 Only play expired sound for access denial
    if (!result.success && result.log?.action === "not-applicable") {
      playExpiredSound()
    }

    setLastScan(result)
    await updateActiveSessions()
    await updateTodayCheckIns()
  }

  const { isScanning } = useQRScanner(handleScan)

  // -------------------------------
  // INITIAL LOAD
  // -------------------------------

  useEffect(() => {
    const loadInitialData = async () => {
      await updateActiveSessions()
      await updateTodayCheckIns()
      await updateTotalMembers()
    }
    loadInitialData()
  }, [])

  // -------------------------------
  // AUTO CLEAR RESULT
  // -------------------------------

  useEffect(() => {
    if (!lastScan) return
    const timer = setTimeout(() => setLastScan(null), 5000)
    return () => clearTimeout(timer)
  }, [lastScan])

  // -------------------------------
  // AUDIO UNLOCK (BROWSER POLICY)
  // -------------------------------

  useEffect(() => {
    const unlockAudio = () => {
      const audio = new Audio("/sounds/expired.wav")
      audio
        .play()
        .then(() => {
          audio.pause()
          audio.currentTime = 0
        })
        .catch(() => {})
      window.removeEventListener("click", unlockAudio)
    }

    window.addEventListener("click", unlockAudio)
    return () => window.removeEventListener("click", unlockAudio)
  }, [])

  // -------------------------------
  // ACTION LABEL + STYLE
  // -------------------------------

  const renderActionBadge = (log: ScanLog) => {
    switch (log.action) {
      case "check-in":
        return <Badge variant="default">Checked In</Badge>
      case "check-out":
        return <Badge variant="secondary">Checked Out</Badge>
      case "not-applicable":
        return <Badge variant="destructive">Access Denied</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  // -------------------------------
  // UI
  // -------------------------------

  return (
    <div className="space-y-6">
      {/* STATS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6 bg-primary/10 border-primary/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Active Now</p>
              <p className="text-2xl font-bold text-primary mt-1">{activeSessions}</p>
            </div>
            <Clock className="w-8 h-8 text-primary" />
          </div>
        </Card>

        <Card className="p-6 bg-success/10 border-success/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Today's Check-ins</p>
              <p className="text-2xl font-bold text-success mt-1">{todayCheckIns}</p>
            </div>
            <CheckCircle2 className="w-8 h-8 text-success" />
          </div>
        </Card>

        <Card className="p-6 bg-accent/10 border-accent/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Members</p>
              <p className="text-2xl font-bold text-accent mt-1">{totalMembers}</p>
            </div>
            <ScanLine className="w-8 h-8 text-accent" />
          </div>
        </Card>
      </div>

      {/* SCANNER */}
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center min-h-[350px] space-y-6">
          <div
            className={`p-8 rounded-full ${
              isScanning ? "bg-primary/20 animate-pulse" : "bg-muted"
            }`}
          >
            <ScanLine
              className={`w-16 h-16 ${
                isScanning ? "text-primary" : "text-muted-foreground"
              }`}
            />
          </div>

          <div className="text-center">
            <h2 className="text-2xl font-semibold">
              {isScanning ? "Scanning..." : "Ready to Scan"}
            </h2>
            <p className="text-muted-foreground mt-2">
              Scan a member QR code
            </p>
          </div>

          {/* RESULT */}
          {lastScan && (
            <Card
              className={`p-6 w-full max-w-md border-2 ${
                lastScan.success
                  ? "bg-success/10 border-success"
                  : "bg-destructive/10 border-destructive"
              }`}
            >
              <div className="flex gap-4">
                {lastScan.success ? (
                  <CheckCircle2 className="w-8 h-8 text-success" />
                ) : (
                  <XCircle className="w-8 h-8 text-destructive" />
                )}

                <div className="flex-1">
                  <p
                    className={`font-semibold text-lg ${
                      lastScan.success ? "text-success" : "text-destructive"
                    }`}
                  >
                    {lastScan.message}
                  </p>

                  {lastScan.log && (
                    <div className="mt-2 space-y-1 text-sm">
                      <p>{lastScan.log.userName}</p>
                      <p className="font-mono text-muted-foreground">
                        {lastScan.log.userId}
                      </p>
                      {renderActionBadge(lastScan.log)}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}
        </div>
      </Card>
    </div>
  )
}
