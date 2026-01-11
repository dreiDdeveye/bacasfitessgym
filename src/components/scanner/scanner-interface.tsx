"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import {
  ScanLine,
  Search,
  Timer,
  Users,
  ChevronRight,
} from "lucide-react"
import { useQRScanner } from "@/src/hooks/use-qr-scanner"
import { accessService } from "@/src/services/access.service"
import { storageService } from "@/src/services/storage.service"
import { subscriptionService } from "@/src/services/subscription.service"
import type { ScanLog, Subscription, User as UserType } from "@/src/types"
import { playExpiredSound } from "@/src/lib/sound"
import {
  startOfDay,
  startOfWeek,
  startOfMonth,
  startOfYear,
} from "date-fns"

type ScanResult = {
  success: boolean
  message: string
  log?: ScanLog
  subscription?: Subscription | null
  user?: UserType | null
}

type MemberWithStats = {
  user: UserType
  subscription: Subscription | null
  isActive: boolean
  gymHours: {
    today: number
    week: number
    month: number
    year: number
    all: number
  }
}

type HoursView = "today" | "week" | "month" | "year" | "all"
type StatusFilter = "all" | "active" | "expired"

export function ScannerInterface() {
  const [lastScan, setLastScan] = useState<ScanResult | null>(null)
  const [activeSessions, setActiveSessions] = useState(0)
  const [todayCheckIns, setTodayCheckIns] = useState(0)
  const [totalMembers, setTotalMembers] = useState(0)
  
  // Members dialog state
  const [showMembersDialog, setShowMembersDialog] = useState(false)
  const [membersWithStats, setMembersWithStats] = useState<MemberWithStats[]>([])
  const [isLoadingMembers, setIsLoadingMembers] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [hoursView, setHoursView] = useState<HoursView>("week")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")

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

  const formatHours = (ms: number) => {
    const hours = ms / (1000 * 60 * 60)
    if (hours < 1) {
      const mins = Math.round(ms / (1000 * 60))
      return `${mins}m`
    }
    return `${hours.toFixed(1)}h`
  }

  /* ---------------- CALCULATE GYM HOURS ---------------- */

  const calculateGymHours = async (userId: string): Promise<MemberWithStats["gymHours"]> => {
    const logs = await storageService.getScanLogsByUserId(userId)
    
    if (!logs.length) {
      return { today: 0, week: 0, month: 0, year: 0, all: 0 }
    }

    const now = new Date()
    const todayStart = startOfDay(now)
    const weekStart = startOfWeek(now, { weekStartsOn: 0 })
    const monthStart = startOfMonth(now)
    const yearStart = startOfYear(now)

    const sorted = logs.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    const calculateForPeriod = (periodStart: Date | null): number => {
      let totalMs = 0
      let lastIn: Date | null = null

      for (const log of sorted) {
        const logTime = new Date(log.timestamp)
        
        // Skip logs before the period
        if (periodStart && logTime < periodStart) continue

        if (log.action === "check-in") {
          lastIn = logTime
        }
        if (log.action === "check-out" && lastIn) {
          totalMs += logTime.getTime() - lastIn.getTime()
          lastIn = null
        }
      }

      return totalMs
    }

    return {
      today: calculateForPeriod(todayStart),
      week: calculateForPeriod(weekStart),
      month: calculateForPeriod(monthStart),
      year: calculateForPeriod(yearStart),
      all: calculateForPeriod(null),
    }
  }

  /* ---------------- LOAD MEMBERS WITH STATS ---------------- */

  const loadMembersWithStats = async () => {
    setIsLoadingMembers(true)
    
    const users = await storageService.getUsers()
    const membersData: MemberWithStats[] = []

    for (const user of users) {
      const subscription = await storageService.getSubscriptionByUserId(user.userId)
      const isActive = subscriptionService.isSubscriptionActive(subscription)
      const gymHours = await calculateGymHours(user.userId)

      membersData.push({
        user,
        subscription,
        isActive,
        gymHours,
      })
    }

    // Sort: active members first, then by name
    membersData.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
      return a.user.name.localeCompare(b.user.name)
    })

    setMembersWithStats(membersData)
    setIsLoadingMembers(false)
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

  /* ---------------- HANDLE MEMBERS CARD CLICK ---------------- */

  const handleMembersCardClick = () => {
    setShowMembersDialog(true)
    loadMembersWithStats()
  }

  /* ---------------- FILTERED MEMBERS ---------------- */

  const filteredMembers = membersWithStats.filter((member) => {
    // Search filter
    const matchesSearch =
      searchTerm === "" ||
      member.user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.user.userId.toLowerCase().includes(searchTerm.toLowerCase())

    // Status filter
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && member.isActive) ||
      (statusFilter === "expired" && !member.isActive)

    return matchesSearch && matchesStatus
  })

  const activeCount = membersWithStats.filter((m) => m.isActive).length
  const expiredCount = membersWithStats.filter((m) => !m.isActive).length

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
        
        {/* Clickable Total Members Card */}
        <Card 
          className="p-6 cursor-pointer hover:bg-zinc-800/50 transition-colors group"
          onClick={handleMembersCardClick}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Members</p>
              <p className="text-2xl font-bold">{totalMembers}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
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

      {/* ================= MEMBERS DIALOG ================= */}
      <Dialog open={showMembersDialog} onOpenChange={setShowMembersDialog}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              All Members ({totalMembers})
            </DialogTitle>
          </DialogHeader>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 py-3 border-b">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ({membersWithStats.length})</SelectItem>
                <SelectItem value="active">Active ({activeCount})</SelectItem>
                <SelectItem value="expired">Expired ({expiredCount})</SelectItem>
              </SelectContent>
            </Select>

            {/* Hours View */}
            <Select value={hoursView} onValueChange={(v) => setHoursView(v as HoursView)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Hours view" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="year">This Year</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Stats Summary */}
          <div className="flex gap-4 py-2 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-muted-foreground">Active: {activeCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-muted-foreground">Expired: {expiredCount}</span>
            </div>
          </div>

          {/* Members List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {isLoadingMembers ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">Loading members...</p>
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">No members found</p>
              </div>
            ) : (
              filteredMembers.map((member) => (
                <Card key={member.user.userId} className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    {/* Member Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold truncate">{member.user.name}</span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {member.user.userId}
                        </span>
                        <Badge variant={member.isActive ? "default" : "destructive"}>
                          {member.isActive ? "Active" : "Expired"}
                        </Badge>
                      </div>
                      
                      {/* Subscription Info */}
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {member.subscription && (
                          <>
                            <span>
                              Expires: {formatDate(member.subscription.endDate)}
                            </span>
                            {member.isActive && (
                              <span>
                                ({getRemainingDays(member.subscription)} days left)
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Gym Hours */}
                    <div className="flex items-center gap-2 text-right">
                      <Timer className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="font-bold text-lg">
                          {formatHours(member.gymHours[hoursView])}
                        </p>
                        <p className="text-[10px] text-muted-foreground uppercase">
                          {hoursView === "all" ? "All Time" : `This ${hoursView}`}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* All Hours Breakdown (collapsible or always visible) */}
                  <div className="flex gap-4 mt-3 pt-3 border-t text-xs">
                    <div className="flex-1 text-center">
                      <p className="text-muted-foreground">Today</p>
                      <p className="font-semibold">{formatHours(member.gymHours.today)}</p>
                    </div>
                    <div className="flex-1 text-center">
                      <p className="text-muted-foreground">Week</p>
                      <p className="font-semibold">{formatHours(member.gymHours.week)}</p>
                    </div>
                    <div className="flex-1 text-center">
                      <p className="text-muted-foreground">Month</p>
                      <p className="font-semibold">{formatHours(member.gymHours.month)}</p>
                    </div>
                    <div className="flex-1 text-center">
                      <p className="text-muted-foreground">Year</p>
                      <p className="font-semibold">{formatHours(member.gymHours.year)}</p>
                    </div>
                    <div className="flex-1 text-center">
                      <p className="text-muted-foreground">All</p>
                      <p className="font-semibold">{formatHours(member.gymHours.all)}</p>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ================= SCAN POPUP ================= */}
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