"use client"

import { useState, useEffect, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
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
  Calendar,
  CalendarDays,
  CalendarClock,
  Wifi,
  WifiOff,
  ShieldAlert,
  CloudOff,
  RefreshCw,
  CheckCircle2,
  XCircle,
  CreditCard,
  Receipt,
} from "lucide-react"
import { useQRScanner } from "@/src/hooks/use-qr-scanner"
import { accessService } from "@/src/services/access.service"
import { storageService } from "@/src/services/storage.service"
import { subscriptionService } from "@/src/services/subscription.service"
import { offlineQueue } from "@/src/services/offline-queue.service"
import type { ScanLog, Subscription, User as UserType } from "@/src/types"
import { playLongBeep, speakCheckIn, speakCheckOut, speakExpired } from "@/src/lib/sound"
import {
  startOfDay,
  startOfWeek,
  startOfMonth,
  startOfYear,
  addMonths,
} from "date-fns"

const SCAN_COOLDOWN_SECONDS = 60

// ─── Types ────────────────────────────────────────────────────────────────────

type RenewalPlan = {
  id: "1m" | "6m" | "1y"
  label: string
  months: number
}

const RENEWAL_PLANS: RenewalPlan[] = [
  { id: "1m", label: "1 Month",  months: 1  },
  { id: "6m", label: "6 Months", months: 6  },
  { id: "1y", label: "1 Year",   months: 12 },
]

type PaymentMethod = "cash" | "gcash" | "paymaya" | "banktransfer"
type PaymentFor    = "membership" | "coaching" | "both" | "other"

type PaymentInput = {
  amount: string
  payment_method: PaymentMethod | ""
  reference_number: string
  notes: string
  payment_for: PaymentFor | ""
}

/** Matches the public.payment table schema exactly */
export type PaymentRecord = {
  payment_id: string
  user_id: string
  amount: number
  payment_method: PaymentMethod
  payment_date: string          // ISO 8601 timestamp with timezone
  reference_number: string | null
  notes: string | null
  payment_for: PaymentFor
}

type RenewalState = {
  user: UserType
  subscription: Subscription | null
  prices: Record<RenewalPlan["id"], string>
  selectedPlan: RenewalPlan["id"] | null
  /** 4-step flow: select → payment → confirm → check-in */
  step: "select" | "payment" | "confirm" | "check-in"
  payment: PaymentInput
  isProcessing: boolean
}

type ScanResult = {
  success: boolean
  message: string
  log?: ScanLog
  subscription?: Subscription | null
  user?: UserType | null
}

type DuplicateScan = {
  userName: string
  userId: string
  cooldownLeft: number
}

type MembershipType = "monthly" | "daily" | "walkin" | "unknown"

type MemberWithStats = {
  user: UserType
  subscription: Subscription | null
  isActive: boolean
  membershipType: MembershipType
  gymHours: { today: number; week: number; month: number; year: number; all: number }
}

type HoursView        = "today" | "week" | "month" | "year" | "all"
type StatusFilter     = "all" | "active" | "expired"
type MembershipFilter = "all" | "monthly" | "daily" | "walkin"

// ─── Constants ───────────────────────────────────────────────────────────────

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  gcash: "GCash",
  paymaya: "PayMaya",
  banktransfer: "Bank Transfer",
}

const PAYMENT_FOR_LABELS: Record<PaymentFor, string> = {
  membership: "Membership",
  coaching: "Coaching",
  both: "Membership + Coaching",
  other: "Other",
}

const EMPTY_PAYMENT: PaymentInput = {
  amount: "",
  payment_method: "",
  reference_number: "",
  notes: "",
  payment_for: "",
}

const generatePaymentId = () =>
  `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`

const RENEWAL_STEPS = ["select", "payment", "confirm", "check-in"] as const

// ─── Component ───────────────────────────────────────────────────────────────

export function ScannerInterface() {
  const [lastScan, setLastScan]             = useState<ScanResult | null>(null)
  const [duplicateScan, setDuplicateScan]   = useState<DuplicateScan | null>(null)
  const [activeSessions, setActiveSessions] = useState(0)
  const [todayCheckIns, setTodayCheckIns]   = useState(0)
  const [totalMembers, setTotalMembers]     = useState(0)
  const scanCooldowns = useRef<Map<string, number>>(new Map())
  const [monthlyCount, setMonthlyCount] = useState(0)
  const [dailyCount, setDailyCount]     = useState(0)
  const [walkinCount, setWalkinCount]   = useState(0)
  const [showMembersDialog, setShowMembersDialog] = useState(false)
  const [membersWithStats, setMembersWithStats]   = useState<MemberWithStats[]>([])
  const [isLoadingMembers, setIsLoadingMembers]   = useState(false)
  const [searchTerm, setSearchTerm]               = useState("")
  const [hoursView, setHoursView]                 = useState<HoursView>("week")
  const [statusFilter, setStatusFilter]           = useState<StatusFilter>("all")
  const [membershipFilter, setMembershipFilter]   = useState<MembershipFilter>("all")
  const [lastUpdate, setLastUpdate]               = useState<Date>(new Date())
  const [isOnline, setIsOnline]   = useState(typeof navigator !== "undefined" ? navigator.onLine : true)
  const [pendingSyncCount, setPendingSyncCount]   = useState(0)

  // ── Renewal ───────────────────────────────────────────────────────────────
  const [renewal, setRenewal] = useState<RenewalState | null>(null)

  const openRenewal = (user: UserType, subscription: Subscription | null) => {
    setRenewal({
      user,
      subscription,
      prices: { "1m": "", "6m": "", "1y": "" },
      selectedPlan: null,
      step: "select",
      payment: EMPTY_PAYMENT,
      isProcessing: false,
    })
    setLastScan(null)
  }

  const closeRenewal = () => setRenewal(null)

  /** Move from plan selection to payment, pre-filling amount from the chosen plan's price */
  const handleGoToPayment = () => {
    if (!renewal?.selectedPlan) return
    setRenewal(prev =>
      prev
        ? {
            ...prev,
            step: "payment",
            payment: {
              ...EMPTY_PAYMENT,
              amount: prev.prices[prev.selectedPlan!] || "",
              payment_for: "membership",
            },
          }
        : null
    )
  }

  /** Save payment record + upsert subscription */
  const handleRenewConfirm = async () => {
    if (!renewal?.selectedPlan) return
    setRenewal(prev => prev ? { ...prev, isProcessing: true } : null)

    const plan   = RENEWAL_PLANS.find(p => p.id === renewal.selectedPlan)!
    const now    = new Date()
    const newEnd = addMonths(now, plan.months)

    const amount = parseFloat(renewal.payment.amount || "0")

    // Build Payment object matching storageService.addPayment / Payment type
    const paymentRecord = {
      paymentId:       generatePaymentId(),
      userId:          renewal.user.userId,
      amount,
      paymentMethod:   renewal.payment.payment_method as PaymentMethod,
      paymentDate:     now.toISOString(),
      referenceNumber: renewal.payment.reference_number || null,
      notes:           renewal.payment.notes || null,
      paymentFor:      renewal.payment.payment_for as PaymentFor,
      createdAt:       now.toISOString(),
      updatedAt:       now.toISOString(),
    }

    await storageService.addPayment(paymentRecord as any)

    // Build Subscription using fields that exist in the storage service schema
    const planDurationMap: Record<RenewalPlan["id"], string> = {
      "1m": "1 month",
      "6m": "6 months",
      "1y": "1 year",
    }

    const updatedSub: Subscription = {
      ...(renewal.subscription ?? {}),
      userId:       renewal.user.userId,
      startDate:    now.toISOString(),
      endDate:      newEnd.toISOString(),
      status:       "active",
      planDuration: planDurationMap[renewal.selectedPlan!],
      membershipType: renewal.subscription?.membershipType ?? "monthly",
      coachingPreference: renewal.subscription?.coachingPreference ?? false,
      paymentStatus: "paid",
      paymentDate:   now.toISOString(),
      createdAt:     renewal.subscription?.createdAt ?? now.toISOString(),
    } as Subscription

    await storageService.addOrUpdateSubscription(updatedSub)
    await updateStats()

    setRenewal(prev =>
      prev ? { ...prev, step: "check-in", isProcessing: false, subscription: updatedSub } : null
    )
  }

  const handleCheckInAfterRenewal = async () => {
    if (!renewal) return
    await accessService.processScan(renewal.user.userId)
    speakCheckIn(renewal.user.name)
    updateStats()
    closeRenewal()
  }

  // Derived
  const selectedPlanObj = renewal ? RENEWAL_PLANS.find(p => p.id === renewal.selectedPlan) : null
  const renewalNewEnd   = selectedPlanObj ? addMonths(new Date(), selectedPlanObj.months) : null
  const needsReference  = !!renewal?.payment.payment_method && renewal.payment.payment_method !== "cash"
  const isPaymentValid  = !!renewal?.payment.amount &&
    parseFloat(renewal.payment.amount) > 0 &&
    !!renewal.payment.payment_method &&
    !!renewal.payment.payment_for &&
    (!needsReference || !!renewal.payment.reference_number)
  // ──────────────────────────────────────────────────────────────────────────

  const formatDate = (date?: string) => {
    if (!date) return "—"
    return new Date(date).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })
  }

  const getRemainingDays = (sub?: Subscription | null) =>
    sub ? Math.ceil((new Date(sub.endDate).getTime() - Date.now()) / 86400000) : 0

  const getExpiryStatus = (sub?: Subscription | null) => {
    if (!sub) return "expired"
    const d = getRemainingDays(sub)
    if (d <= 0) return "expired"
    if (d <= 7) return "soon"
    return "active"
  }

  const formatHours = (ms: number) => {
    const h = ms / 3600000
    return h < 1 ? `${Math.round(ms / 60000)}m` : `${h.toFixed(1)}h`
  }

  const formatLastUpdate = (date: Date) => {
    const s = Math.floor((Date.now() - date.getTime()) / 1000)
    if (s < 10) return "Just now"
    if (s < 60) return `${s}s ago`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m}m ago`
    return date.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })
  }

  const getMembershipType = (subscription: Subscription | null): MembershipType => {
    if (!subscription) return "unknown"
    const start = new Date(subscription.startDate)
    const end   = new Date(subscription.endDate)
    const dh    = (end.getTime() - start.getTime()) / 3600000
    if (end.getHours() === 0 && end.getMinutes() === 0 && dh <= 24) return "daily"
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
    if ([1, 6, 12].includes(months)) return "monthly"
    return "walkin"
  }

  const getMembershipLabel = (type: MembershipType) =>
    ({ monthly: "Monthly", daily: "Daily", walkin: "Walk-in", unknown: "Unknown" }[type])

  const getMembershipBadge = (type: MembershipType) => {
    switch (type) {
      case "monthly": return <Badge variant="default">Monthly</Badge>
      case "daily":   return <Badge className="bg-purple-600 text-white">Daily</Badge>
      case "walkin":  return <Badge variant="outline" className="text-blue-600 border-blue-600">Walk-in</Badge>
      default:        return <Badge variant="secondary">Unknown</Badge>
    }
  }

  const calculateGymHours = async (userId: string): Promise<MemberWithStats["gymHours"]> => {
    const logs = await storageService.getScanLogsByUserId(userId)
    if (!logs.length) return { today: 0, week: 0, month: 0, year: 0, all: 0 }
    const now    = new Date()
    const sorted = logs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    const calc   = (periodStart: Date | null) => {
      let totalMs = 0, lastIn: Date | null = null
      for (const log of sorted) {
        const t = new Date(log.timestamp)
        if (periodStart && t < periodStart) continue
        if (log.action === "check-in") lastIn = t
        if (log.action === "check-out" && lastIn) { totalMs += t.getTime() - lastIn.getTime(); lastIn = null }
      }
      return totalMs
    }
    return {
      today: calc(startOfDay(now)),
      week:  calc(startOfWeek(now, { weekStartsOn: 0 })),
      month: calc(startOfMonth(now)),
      year:  calc(startOfYear(now)),
      all:   calc(null),
    }
  }

  const loadMembersWithStats = async () => {
    setIsLoadingMembers(true)
    const [users, allSubscriptions] = await Promise.all([storageService.getUsers(), storageService.getSubscriptions()])
    const subscriptionMap = new Map(allSubscriptions.map(sub => [sub.userId, sub]))
    const membersData: MemberWithStats[] = users.map(user => {
      const subscription   = subscriptionMap.get(user.userId) || null
      const isActive       = subscriptionService.isSubscriptionActive(subscription)
      const membershipType = getMembershipType(subscription)
      return { user, subscription, isActive, membershipType, gymHours: { today: 0, week: 0, month: 0, year: 0, all: 0 } }
    })
    membersData.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
      return a.user.name.localeCompare(b.user.name)
    })
    setMembersWithStats(membersData)
    setIsLoadingMembers(false)
    for (const member of membersData) {
      const gymHours = await calculateGymHours(member.user.userId)
      setMembersWithStats(prev => {
        const updated = [...prev]
        const idx     = updated.findIndex(m => m.user.userId === member.user.userId)
        if (idx !== -1) updated[idx] = { ...updated[idx], gymHours }
        return updated
      })
    }
  }

  const updateStats = async () => {
    try {
      const [sessions, logs, users, allSubscriptions] = await Promise.all([
        storageService.getActiveSessions(),
        storageService.getTodayScanLogs(),
        storageService.getUsers(),
        storageService.getSubscriptions(),
      ])
      setActiveSessions(sessions.length)
      setTodayCheckIns(logs.filter(l => l.action === "check-in").length)
      setTotalMembers(users.length)
      const subMap = new Map(allSubscriptions.map(sub => [sub.userId, sub]))
      let monthly = 0, daily = 0, walkin = 0
      for (const user of users) {
        const t = getMembershipType(subMap.get(user.userId) || null)
        if (t === "monthly") monthly++
        else if (t === "daily") daily++
        else if (t === "walkin") walkin++
      }
      setMonthlyCount(monthly); setDailyCount(daily); setWalkinCount(walkin)
      setLastUpdate(new Date()); setIsOnline(true)
    } catch { setIsOnline(false) }
  }

  const handleScan = async (code: string) => {
    const userId = code.trim()
    const lastScanTime = scanCooldowns.current.get(userId)
    const now = Date.now()
    if (lastScanTime) {
      const elapsed = (now - lastScanTime) / 1000
      if (elapsed < SCAN_COOLDOWN_SECONDS) {
        const cooldownLeft = Math.ceil(SCAN_COOLDOWN_SECONDS - elapsed)
        const user = await storageService.getUserById(userId)
        setDuplicateScan({ userName: user?.name || userId, userId, cooldownLeft })
        return
      }
    }

    const result = await accessService.processScan(code)
    let subscription: Subscription | null = null
    let user: UserType | null = null
    if (result.log?.userId) {
      subscription = await storageService.getSubscriptionByUserId(result.log.userId)
      user         = await storageService.getUserById(result.log.userId)
    }

    const name = user?.name || result.log?.userName

    if (!result.success) {
      playLongBeep(5)
      speakExpired(name)
      if (user) { openRenewal(user, subscription); return }
    } else if (result.log?.action === "check-in") {
      speakCheckIn(name || "member"); scanCooldowns.current.set(userId, now)
    } else if (result.log?.action === "check-out") {
      speakCheckOut(name || "member"); scanCooldowns.current.set(userId, now)
    }

    setLastScan({ ...result, subscription, user })
    setPendingSyncCount(offlineQueue.getPendingCount())
    updateStats()
  }

  const { isScanning } = useQRScanner(handleScan)

  useEffect(() => { updateStats(); const i = setInterval(updateStats, 5000); return () => clearInterval(i) }, [])
  useEffect(() => { if (showMembersDialog) loadMembersWithStats() }, [showMembersDialog])
  useEffect(() => {
    const enter = () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); window.removeEventListener("click", enter) }
    window.addEventListener("click", enter); return () => window.removeEventListener("click", enter)
  }, [])
  useEffect(() => { if (!lastScan) return; const t = setTimeout(() => setLastScan(null), 5000); return () => clearTimeout(t) }, [lastScan])
  useEffect(() => { if (!duplicateScan) return; const t = setTimeout(() => setDuplicateScan(null), 3000); return () => clearTimeout(t) }, [duplicateScan])
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true)
      const { synced } = await offlineQueue.flushQueue()
      if (synced > 0) console.log(`Synced ${synced} offline items`)
      setPendingSyncCount(offlineQueue.getPendingCount()); updateStats()
    }
    const handleOffline = () => setIsOnline(false)
    window.addEventListener("online", handleOnline); window.addEventListener("offline", handleOffline)
    setPendingSyncCount(offlineQueue.getPendingCount())
    if (navigator.onLine && offlineQueue.getPendingCount() > 0)
      offlineQueue.flushQueue().then(() => setPendingSyncCount(offlineQueue.getPendingCount()))
    return () => { window.removeEventListener("online", handleOnline); window.removeEventListener("offline", handleOffline) }
  }, [])

  const handleMembersCardClick = (filter?: MembershipFilter) => {
    setMembershipFilter(filter || "all"); setShowMembersDialog(true)
  }

  const filteredMembers = membersWithStats.filter(m => {
    const ms = searchTerm === "" || m.user.name.toLowerCase().includes(searchTerm.toLowerCase()) || m.user.userId.toLowerCase().includes(searchTerm.toLowerCase())
    const ss = statusFilter === "all" || (statusFilter === "active" && m.isActive) || (statusFilter === "expired" && !m.isActive)
    const ts = membershipFilter === "all" || m.membershipType === membershipFilter
    return ms && ss && ts
  })

  const activeCount          = membersWithStats.filter(m => m.isActive).length
  const expiredCount         = membersWithStats.filter(m => !m.isActive).length
  const filteredMonthlyCount = membersWithStats.filter(m => m.membershipType === "monthly").length
  const filteredDailyCount   = membersWithStats.filter(m => m.membershipType === "daily").length
  const filteredWalkinCount  = membersWithStats.filter(m => m.membershipType === "walkin").length

  return (
    <div className="space-y-6">
      {/* Status bar */}
      <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
        {isOnline ? <Wifi className="w-3 h-3 text-emerald-500" /> : <WifiOff className="w-3 h-3 text-red-500" />}
        <span>{isOnline ? "Live" : "Offline"} • Updated {formatLastUpdate(lastUpdate)}</span>
        {pendingSyncCount > 0 && (
          <span className="flex items-center gap-1 text-yellow-500">
            <CloudOff className="w-3 h-3" />{pendingSyncCount} pending sync
          </span>
        )}
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <Card className="p-3 md:p-6"><p className="text-xs md:text-sm text-muted-foreground">Active Now</p><p className="text-xl md:text-2xl font-bold">{activeSessions}</p></Card>
        <Card className="p-3 md:p-6"><p className="text-xs md:text-sm text-muted-foreground">Today's Check-ins</p><p className="text-xl md:text-2xl font-bold">{todayCheckIns}</p></Card>
        <Card className="p-3 md:p-6 cursor-pointer hover:bg-zinc-800/50 transition-colors group" onClick={() => handleMembersCardClick("all")}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-3">
              <Users className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground hidden sm:block" />
              <div><p className="text-xs md:text-sm text-muted-foreground">Total Members</p><p className="text-xl md:text-2xl font-bold">{totalMembers}</p></div>
            </div>
            <ChevronRight className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
        </Card>
      </div>

      {/* Membership breakdown */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <Card className="p-3 md:p-6 cursor-pointer hover:bg-zinc-800/50 transition-colors group border-l-4 border-l-primary" onClick={() => handleMembersCardClick("monthly")}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-3">
              <CalendarDays className="w-4 h-4 md:w-5 md:h-5 text-primary hidden sm:block" />
              <div><p className="text-xs md:text-sm text-muted-foreground">Monthly</p><p className="text-xl md:text-2xl font-bold">{monthlyCount}</p><p className="text-[10px] md:text-xs text-muted-foreground hidden sm:block">1m, 6m, 1 year plans</p></div>
            </div>
            <ChevronRight className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground group-hover:text-foreground transition-colors hidden sm:block" />
          </div>
        </Card>
        <Card className="p-3 md:p-6 cursor-pointer hover:bg-zinc-800/50 transition-colors group border-l-4 border-l-purple-600" onClick={() => handleMembersCardClick("daily")}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-3">
              <Calendar className="w-4 h-4 md:w-5 md:h-5 text-purple-600 hidden sm:block" />
              <div><p className="text-xs md:text-sm text-muted-foreground">Daily</p><p className="text-xl md:text-2xl font-bold">{dailyCount}</p><p className="text-[10px] md:text-xs text-muted-foreground hidden sm:block">Expires at midnight</p></div>
            </div>
            <ChevronRight className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground group-hover:text-foreground transition-colors hidden sm:block" />
          </div>
        </Card>
        <Card className="p-3 md:p-6 cursor-pointer hover:bg-zinc-800/50 transition-colors group border-l-4 border-l-blue-600" onClick={() => handleMembersCardClick("walkin")}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-3">
              <CalendarClock className="w-4 h-4 md:w-5 md:h-5 text-blue-600 hidden sm:block" />
              <div><p className="text-xs md:text-sm text-muted-foreground">Walk-in</p><p className="text-xl md:text-2xl font-bold">{walkinCount}</p><p className="text-[10px] md:text-xs text-muted-foreground hidden sm:block">Custom date range</p></div>
            </div>
            <ChevronRight className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground group-hover:text-foreground transition-colors hidden sm:block" />
          </div>
        </Card>
      </div>

      {/* Scanner card */}
      <Card className="p-6 md:p-10 flex flex-col items-center justify-center min-h-[250px] md:min-h-[350px]">
        <div className={`p-6 md:p-10 rounded-full ${isScanning ? "bg-primary/20 animate-pulse" : "bg-muted"}`}>
          <ScanLine className="w-12 h-12 md:w-20 md:h-20 text-primary" />
        </div>
        <h2 className="text-2xl md:text-3xl font-bold mt-4 md:mt-6">{isScanning ? "Scanning..." : "Ready to Scan"}</h2>
        <p className="text-muted-foreground mt-2 text-sm md:text-base">Present QR Code to Scanner</p>
      </Card>

      {/* ── Members dialog ─────────────────────────────────────────────────── */}
      <Dialog open={showMembersDialog} onOpenChange={setShowMembersDialog}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col w-[95vw] md:w-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {membershipFilter === "all"
                ? `All Members (${totalMembers})`
                : `${getMembershipLabel(membershipFilter)} Members (${membershipFilter === "monthly" ? monthlyCount : membershipFilter === "daily" ? dailyCount : walkinCount})`}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col sm:flex-row gap-3 py-3 border-b">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by name or ID..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
            <Select value={membershipFilter} onValueChange={v => setMembershipFilter(v as MembershipFilter)}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="monthly">Monthly ({filteredMonthlyCount})</SelectItem>
                <SelectItem value="daily">Daily ({filteredDailyCount})</SelectItem>
                <SelectItem value="walkin">Walk-in ({filteredWalkinCount})</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ({membersWithStats.length})</SelectItem>
                <SelectItem value="active">Active ({activeCount})</SelectItem>
                <SelectItem value="expired">Expired ({expiredCount})</SelectItem>
              </SelectContent>
            </Select>
            <Select value={hoursView} onValueChange={v => setHoursView(v as HoursView)}>
              <SelectTrigger className="w-[130px]"><SelectValue placeholder="Hours" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="year">This Year</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-4 py-2 text-sm">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-muted-foreground">Active: {activeCount}</span></div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500" /><span className="text-muted-foreground">Expired: {expiredCount}</span></div>
            <span className="text-muted-foreground">|</span>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-primary" /><span className="text-muted-foreground">Monthly: {filteredMonthlyCount}</span></div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-purple-600" /><span className="text-muted-foreground">Daily: {filteredDailyCount}</span></div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-600" /><span className="text-muted-foreground">Walk-in: {filteredWalkinCount}</span></div>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {isLoadingMembers ? (
              <div className="flex items-center justify-center py-12"><p className="text-muted-foreground">Loading members...</p></div>
            ) : filteredMembers.length === 0 ? (
              <div className="flex items-center justify-center py-12"><p className="text-muted-foreground">No members found</p></div>
            ) : (
              filteredMembers.map(member => (
                <Card key={member.user.userId} className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold truncate">{member.user.name}</span>
                        <span className="text-xs text-muted-foreground font-mono">{member.user.userId}</span>
                        <Badge variant={member.isActive ? "default" : "destructive"}>{member.isActive ? "Active" : "Expired"}</Badge>
                        {getMembershipBadge(member.membershipType)}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {member.subscription && (
                          <><span>Expires: {formatDate(member.subscription.endDate)}</span>{member.isActive && <span>({getRemainingDays(member.subscription)} days left)</span>}</>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-right">
                      <Timer className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="font-bold text-lg">{formatHours(member.gymHours[hoursView])}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">{hoursView === "all" ? "All Time" : `This ${hoursView}`}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 md:gap-4 mt-3 pt-3 border-t text-[10px] md:text-xs">
                    {(["today", "week", "month", "year", "all"] as HoursView[]).map(v => (
                      <div key={v} className="flex-1 text-center">
                        <p className="text-muted-foreground capitalize">{v === "all" ? "All" : v.charAt(0).toUpperCase() + v.slice(1)}</p>
                        <p className="font-semibold">{formatHours(member.gymHours[v])}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── DUPLICATE SCAN POPUP ──────────────────────────────────────────── */}
      {duplicateScan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
          <Card className="w-full max-w-xl p-5 md:p-8 bg-white rounded-xl shadow-2xl border border-yellow-400">
            <div className="flex items-start gap-3 md:gap-4">
              <div className="p-2 md:p-3 rounded-full bg-yellow-100 shrink-0">
                <ShieldAlert className="w-6 h-6 md:w-8 md:h-8 text-yellow-600" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl md:text-2xl font-bold text-yellow-700">Already Scanned</h2>
                <p className="text-base md:text-lg font-semibold mt-1 truncate">{duplicateScan.userName}</p>
                <p className="text-xs md:text-sm text-gray-500 mt-1 truncate">ID: {duplicateScan.userId}</p>
                <p className="text-xs md:text-sm text-gray-600 mt-3">
                  This QR code was just scanned. Please wait{" "}
                  <span className="font-bold text-yellow-700">{duplicateScan.cooldownLeft}s</span>{" "}
                  before scanning again.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── SCAN RESULT POPUP ─────────────────────────────────────────────── */}
      {lastScan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
          <Card className="w-full max-w-xl p-5 md:p-8 bg-white rounded-xl shadow-2xl border">
            <div className="flex gap-4 md:gap-6">
              <div className="flex-1 min-w-0">
                <h2 className={`text-2xl md:text-3xl font-bold ${lastScan.success ? "text-gold-600" : "text-black-600"}`}>{lastScan.message}</h2>
                <p className="text-base md:text-lg font-bold mt-1 truncate">{lastScan.user?.name || lastScan.log?.userName || "Unknown User"}</p>
                <p className="text-xs md:text-sm text-gray-600 truncate">ID: {lastScan.log?.userId}</p>
                <div className="mt-2">{lastScan.subscription && getMembershipBadge(getMembershipType(lastScan.subscription))}</div>
                <div className="mt-3 md:mt-4">
                  {(() => {
                    const status = getExpiryStatus(lastScan.subscription)
                    const days   = getRemainingDays(lastScan.subscription)
                    if (status === "expired") return <Badge variant="destructive">🔴 Expired</Badge>
                    if (status === "soon")    return <Badge className="bg-yellow-400 text-black">🟡 Expiring Soon ({days} days)</Badge>
                    return <Badge className="bg-green-600">🟢 Active — Expires {formatDate(lastScan.subscription?.endDate)}</Badge>
                  })()}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── RENEWAL POPUP (4-step) ─────────────────────────────────────────── */}
      {renewal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <Card className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-red-200 overflow-hidden">

            {/* Header */}
            <div className="bg-red-50 px-6 py-4 border-b border-red-100">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-full bg-red-100 shrink-0">
                    <RefreshCw className="w-5 h-5 text-red-600" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-red-700">Membership Expired</h2>
                    <p className="text-sm text-red-500 font-medium truncate">{renewal.user.name} · {renewal.user.userId}</p>
                  </div>
                </div>
                {/* Step dots */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {RENEWAL_STEPS.map((s, i) => {
                    const currentIdx = RENEWAL_STEPS.indexOf(renewal.step)
                    return (
                      <div
                        key={s}
                        className={`rounded-full transition-all ${
                          i === currentIdx ? "w-5 h-2 bg-red-500" :
                          i < currentIdx  ? "w-2 h-2 bg-red-300" :
                                            "w-2 h-2 bg-gray-200"
                        }`}
                      />
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4 max-h-[72vh] overflow-y-auto">

              {/* ── STEP 1: Select plan ──────────────────────────────────── */}
              {renewal.step === "select" && (
                <>
                  <p className="text-sm text-gray-500">Choose a renewal plan and set a price.</p>
                  <div className="space-y-3">
                    {RENEWAL_PLANS.map(plan => (
                      <div
                        key={plan.id}
                        onClick={() => setRenewal(prev => prev ? { ...prev, selectedPlan: plan.id } : null)}
                        className={`flex items-center justify-between gap-4 rounded-xl border-2 p-4 cursor-pointer transition-all ${
                          renewal.selectedPlan === plan.id ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${renewal.selectedPlan === plan.id ? "border-primary" : "border-gray-300"}`}>
                            {renewal.selectedPlan === plan.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                          </div>
                          <span className="font-semibold text-gray-800">{plan.label}</span>
                        </div>
                        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                          <span className="text-sm font-medium text-gray-500">₱</span>
                          <Input
                            type="number" min="0" placeholder="0.00"
                            value={renewal.prices[plan.id]}
                            onChange={e => setRenewal(prev => prev ? { ...prev, prices: { ...prev.prices, [plan.id]: e.target.value } } : null)}
                            className="w-28 text-right font-mono"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3 pt-1">
                    <Button variant="outline" className="flex-1" onClick={closeRenewal}>
                      <XCircle className="w-4 h-4 mr-2" />Cancel
                    </Button>
                    <Button
                      className="flex-1"
                      disabled={!renewal.selectedPlan || !renewal.prices[renewal.selectedPlan!]}
                      onClick={handleGoToPayment}
                    >
                      <CreditCard className="w-4 h-4 mr-2" />Next: Payment
                    </Button>
                  </div>
                </>
              )}

              {/* ── STEP 2: Payment details ──────────────────────────────── */}
              {renewal.step === "payment" && (
                <>
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-gray-500" />
                    <p className="text-sm font-semibold text-gray-700">Payment Details</p>
                  </div>

                  <div className="space-y-4">
                    {/* Amount */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-gray-600">
                        Amount <span className="text-red-500">*</span>
                      </Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">₱</span>
                        <Input
                          type="number" min="0.01" step="0.01" placeholder="0.00"
                          value={renewal.payment.amount}
                          onChange={e => setRenewal(prev => prev ? { ...prev, payment: { ...prev.payment, amount: e.target.value } } : null)}
                          className="pl-7 font-mono"
                        />
                      </div>
                    </div>

                    {/* Payment Method — pill buttons */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-gray-600">
                        Payment Method <span className="text-red-500">*</span>
                      </Label>
                      <div className="grid grid-cols-4 gap-2">
                        {(["cash", "gcash", "paymaya", "banktransfer"] as PaymentMethod[]).map(m => (
                          <button
                            key={m} type="button"
                            onClick={() => setRenewal(prev => prev ? { ...prev, payment: { ...prev.payment, payment_method: m, reference_number: "" } } : null)}
                            className={`rounded-lg border-2 py-2.5 text-xs font-semibold transition-all ${
                              renewal.payment.payment_method === m
                                ? "border-primary bg-primary/5 text-primary"
                                : "border-gray-200 text-gray-600 hover:border-gray-300"
                            }`}
                          >
                            {PAYMENT_METHOD_LABELS[m]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Reference number — only for non-cash */}
                    {needsReference && (
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-gray-600">
                          Reference Number <span className="text-red-500">*</span>
                          <span className="text-gray-400 font-normal ml-1">
                            ({PAYMENT_METHOD_LABELS[renewal.payment.payment_method as PaymentMethod]} ref)
                          </span>
                        </Label>
                        <Input
                          placeholder="Transaction reference number"
                          value={renewal.payment.reference_number}
                          onChange={e => setRenewal(prev => prev ? { ...prev, payment: { ...prev.payment, reference_number: e.target.value } } : null)}
                          className="font-mono"
                        />
                      </div>
                    )}

                    {/* Payment For — pill buttons */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-gray-600">
                        Payment For <span className="text-red-500">*</span>
                      </Label>
                      <div className="grid grid-cols-2 gap-2">
                        {(["membership", "coaching", "both", "other"] as PaymentFor[]).map(pf => (
                          <button
                            key={pf} type="button"
                            onClick={() => setRenewal(prev => prev ? { ...prev, payment: { ...prev.payment, payment_for: pf } } : null)}
                            className={`rounded-lg border-2 py-2.5 text-xs font-semibold transition-all ${
                              renewal.payment.payment_for === pf
                                ? "border-primary bg-primary/5 text-primary"
                                : "border-gray-200 text-gray-600 hover:border-gray-300"
                            }`}
                          >
                            {PAYMENT_FOR_LABELS[pf]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-gray-600">
                        Notes <span className="text-gray-400 font-normal">(optional)</span>
                      </Label>
                      <Textarea
                        placeholder="Any additional notes..."
                        value={renewal.payment.notes}
                        onChange={e => setRenewal(prev => prev ? { ...prev, payment: { ...prev.payment, notes: e.target.value } } : null)}
                        className="resize-none text-sm" rows={2}
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-1">
                    <Button variant="outline" className="flex-1" onClick={() => setRenewal(prev => prev ? { ...prev, step: "select" } : null)}>
                      Back
                    </Button>
                    <Button className="flex-1" disabled={!isPaymentValid} onClick={() => setRenewal(prev => prev ? { ...prev, step: "confirm" } : null)}>
                      <Receipt className="w-4 h-4 mr-2" />Review & Confirm
                    </Button>
                  </div>
                </>
              )}

              {/* ── STEP 3: Confirm ──────────────────────────────────────── */}
              {renewal.step === "confirm" && selectedPlanObj && (
                <>
                  <p className="text-sm text-gray-500">Review the details before confirming.</p>

                  {/* Subscription row */}
                  <div className="rounded-xl border divide-y text-sm overflow-hidden">
                    <div className="px-4 py-2 bg-gray-50">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Subscription</p>
                    </div>
                    <div className="px-4 py-2.5 flex justify-between"><span className="text-gray-500">Member</span><span className="font-semibold">{renewal.user.name}</span></div>
                    <div className="px-4 py-2.5 flex justify-between"><span className="text-gray-500">Plan</span><span className="font-semibold">{selectedPlanObj.label}</span></div>
                    <div className="px-4 py-2.5 flex justify-between"><span className="text-gray-500">New Expiry</span><span className="font-semibold">{renewalNewEnd?.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}</span></div>
                  </div>

                  {/* Payment row */}
                  <div className="rounded-xl border border-green-100 divide-y text-sm overflow-hidden">
                    <div className="px-4 py-2 bg-green-50">
                      <p className="text-xs font-semibold text-green-700 uppercase tracking-wide flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5" />Payment
                      </p>
                    </div>
                    <div className="px-4 py-2.5 flex justify-between"><span className="text-gray-500">Amount</span><span className="font-bold text-green-700">₱{parseFloat(renewal.payment.amount || "0").toLocaleString("en-PH", { minimumFractionDigits: 2 })}</span></div>
                    <div className="px-4 py-2.5 flex justify-between"><span className="text-gray-500">Method</span><span className="font-semibold">{PAYMENT_METHOD_LABELS[renewal.payment.payment_method as PaymentMethod]}</span></div>
                    <div className="px-4 py-2.5 flex justify-between"><span className="text-gray-500">For</span><span className="font-semibold">{PAYMENT_FOR_LABELS[renewal.payment.payment_for as PaymentFor]}</span></div>
                    {renewal.payment.reference_number && (
                      <div className="px-4 py-2.5 flex justify-between"><span className="text-gray-500">Reference</span><span className="font-mono font-semibold">{renewal.payment.reference_number}</span></div>
                    )}
                    {renewal.payment.notes && (
                      <div className="px-4 py-2.5 flex justify-between gap-4"><span className="text-gray-500 shrink-0">Notes</span><span className="text-right text-gray-700">{renewal.payment.notes}</span></div>
                    )}
                  </div>

                  <div className="flex gap-3 pt-1">
                    <Button variant="outline" className="flex-1" onClick={() => setRenewal(prev => prev ? { ...prev, step: "payment" } : null)} disabled={renewal.isProcessing}>
                      Back
                    </Button>
                    <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={handleRenewConfirm} disabled={renewal.isProcessing}>
                      {renewal.isProcessing ? "Processing…" : "Confirm Renewal"}
                    </Button>
                  </div>
                </>
              )}

              {/* ── STEP 4: Check-in prompt ───────────────────────────────── */}
              {renewal.step === "check-in" && (
                <>
                  <div className="flex flex-col items-center gap-3 py-2">
                    <div className="p-3 rounded-full bg-green-100">
                      <CheckCircle2 className="w-8 h-8 text-green-600" />
                    </div>
                    <h3 className="text-lg font-bold text-green-700">Renewal Successful!</h3>
                    <p className="text-sm text-gray-600 text-center">
                      <span className="font-semibold">{renewal.user.name}</span>'s membership is active until{" "}
                      <span className="font-semibold">{renewal.subscription ? formatDate(renewal.subscription.endDate) : "—"}</span>.
                    </p>
                    <div className="rounded-lg bg-gray-50 border px-4 py-2 text-xs text-center text-gray-500 w-full">
                      Payment of{" "}
                      <span className="font-semibold text-green-700">
                        ₱{parseFloat(renewal.payment.amount || "0").toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                      </span>{" "}
                      via <span className="font-semibold">{PAYMENT_METHOD_LABELS[renewal.payment.payment_method as PaymentMethod]}</span> recorded.
                    </div>
                    <p className="text-sm text-gray-500">Would you like to check them in now?</p>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={closeRenewal}>Not Now</Button>
                    <Button className="flex-1" onClick={handleCheckInAfterRenewal}>
                      <CheckCircle2 className="w-4 h-4 mr-2" />Check In
                    </Button>
                  </div>
                </>
              )}

            </div>
          </Card>
        </div>
      )}
    </div>
  )
}