"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  ScanLine,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  User,
} from "lucide-react"
import { useQRScanner } from "@/src/hooks/use-qr-scanner"
import { accessService } from "@/src/services/access.service"
import { storageService } from "@/src/services/storage.service"
import type { ScanLog, Subscription, User as UserType } from "@/src/types"
import { playExpiredSound } from "@/src/lib/sound"

type ScanResult = {
  success: boolean
  message: string
  log?: ScanLog
  subscription?: Subscription | null
  user?: UserType | null
}

export function ScannerInterface() {
  const [lastScan, setLastScan] = useState<ScanResult | null>(null)
  const [activeSessions, setActiveSessions] = useState(0)
  const [todayCheckIns, setTodayCheckIns] = useState(0)
  const [totalMembers, setTotalMembers] = useState(0)

  /* ---------------- HELPERS ---------------- */

  const formatDate = (date?: string) => {
    if (!date) return "—"
    return new Date(date).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  const getRemainingDays = (sub?: Subscription | null) => {
    if (!sub) return 0
    const diff = new Date(sub.endDate).getTime() - new Date().getTime()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  }

  const getExpiryStatus = (sub?: Subscription | null) => {
    if (!sub) return "expired"
    const days = getRemainingDays(sub)
    if (days <= 0) return "expired"
    if (days <= 7) return "soon"
    return "active"
  }

  /* ---------------- DASHBOARD ---------------- */

  const updateStats = async () => {
    const [sessions, logs, users] = await Promise.all([
      storageService.getActiveSessions(),
      storageService.getTodayScanLogs(),
      storageService.getUsers(),
    ])

    setActiveSessions(sessions.length)
    setTodayCheckIns(logs.filter((l) => l.action === "check-in").length)
    setTotalMembers(users.length)
  }

  /* ---------------- SCAN ---------------- */

  const handleScan = async (code: string) => {
    const result = await accessService.processScan(code)

    let subscription: Subscription | null = null
    let user: UserType | null = null

    if (result.log?.userId) {
      subscription = await storageService.getSubscriptionByUserId(result.log.userId)
      user = await storageService.getUserById(result.log.userId)
    }

    if (!result.success) playExpiredSound()

    setLastScan({ ...result, subscription, user })
    updateStats()
  }

  const { isScanning } = useQRScanner(handleScan)

  /* ---------------- FULLSCREEN KIOSK ---------------- */

  useEffect(() => {
    const enterFullscreen = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {})
      }
      window.removeEventListener("click", enterFullscreen)
    }

    window.addEventListener("click", enterFullscreen)
    return () => window.removeEventListener("click", enterFullscreen)
  }, [])

  /* ---------------- AUTO CLOSE ---------------- */

  useEffect(() => {
    if (!lastScan) return
    const t = setTimeout(() => setLastScan(null), 5000)
    return () => clearTimeout(t)
  }, [lastScan])

  useEffect(() => {
    updateStats()
  }, [])

  /* ================= UI ================= */

  return (
    <div className="space-y-6">
      {/* STATS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Active Now</p>
          <p className="text-2xl font-bold">{activeSessions}</p>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Today's Check-ins</p>
          <p className="text-2xl font-bold">{todayCheckIns}</p>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Total Members</p>
          <p className="text-2xl font-bold">{totalMembers}</p>
        </Card>
      </div>

      {/* SCANNER */}
      <Card className="p-10 flex flex-col items-center justify-center min-h-[350px]">
        <div
          className={`p-10 rounded-full ${
            isScanning ? "bg-primary/20 animate-pulse" : "bg-muted"
          }`}
        >
          <ScanLine className="w-20 h-20 text-primary" />
        </div>
        <h2 className="text-3xl font-bold mt-6">
          {isScanning ? "Scanning..." : "Ready to Scan"}
        </h2>
        <p className="text-muted-foreground mt-2">Present QR Code to Scanner</p>
      </Card>

      {/* ================= POPUP ================= */}
      {lastScan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <Card className="w-full max-w-xl p-8 bg-white rounded-xl shadow-2xl border">
            <div className="flex gap-6">
              {/* INFO */}
              <div className="flex-1">
                <h2
                  className={`text-3xl font-bold ${
                    lastScan.success ? "text-gold-600" : "text-black-600"
                  }`}
                >
                  {lastScan.message}
                </h2>

                <p className="text-lg font-bold mt-1">
                  {lastScan.user?.name || lastScan.log?.userName || "Unknown User"}
                </p>

                <p className="text-sm text-white-600 ">ID: {lastScan.log?.userId}</p>

                {/* Subscription Type Indicator */}
                <div className="mt-2">
                  {(() => {
                    if (!lastScan.subscription) return null

                    const start = new Date(lastScan.subscription.startDate)
                    const end = new Date(lastScan.subscription.endDate)
                    const months =
                      (end.getFullYear() - start.getFullYear()) * 12 +
                      (end.getMonth() - start.getMonth())

                    const regularPlans = [1, 3, 6, 12]
                    const isRegular = regularPlans.includes(months)

                    return (
                      <Badge
                        variant={isRegular ? "default" : "outline"}
                        className={isRegular ? "" : "text-blue-600 border-blue-600"}
                      >
                        {isRegular ? "Regular" : "Walk-in"}
                      </Badge>
                    )
                  })()}
                </div>

                {/* EXPIRY */}
                <div className="mt-4">
                  {(() => {
                    const status = getExpiryStatus(lastScan.subscription)
                    const days = getRemainingDays(lastScan.subscription)

                    if (status === "expired")
                      return <Badge variant="destructive">🔴 Expired</Badge>

                    if (status === "soon")
                      return (
                        <Badge className="bg-yellow-400 text-black">
                          🟡 Expiring Soon ({days} days)
                        </Badge>
                      )

                    return (
                      <Badge className="bg-green-600">
                        🟢 Active — Expires {formatDate(lastScan.subscription?.endDate)}
                      </Badge>
                    )
                  })()}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
