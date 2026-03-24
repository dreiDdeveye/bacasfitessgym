"use client"

import { useState, useEffect, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
} from "lucide-react"
import { useQRScanner } from "@/src/hooks/use-qr-scanner"
import { accessService } from "@/src/services/access.service"
import { storageService } from "@/src/services/storage.service"
import { subscriptionService } from "@/src/services/subscription.service"
import { offlineQueue } from "@/src/services/offline-queue.service"
import type { ScanLog, Subscription, User as UserType, Payment } from "@/src/types"
import { playLongBeep, speakCheckIn, speakCheckOut, speakExpired } from "@/src/lib/sound"
import {
  startOfDay,
  startOfWeek,
  startOfMonth,
  startOfYear,
  addMonths,
  addDays,
} from "date-fns"

const SCAN_COOLDOWN_SECONDS = 60

// ─── Payment types ────────────────────────────────────────────────────────────
type PaymentMethod = "cash" | "gcash" | "paymaya" | "banktransfer"
type PaymentFor    = "membership" | "coaching" | "both" | "other"

// ─── Renewal plan config ──────────────────────────────────────────────────────
type RenewalPlanId = "daily" | "walkin" | "1m" | "6m" | "1y"

type RenewalPlan = {
  id:       RenewalPlanId
  label:    string
  sublabel: string
  months?:  number
  isDaily?: boolean
  isWalkin?: boolean
}

const RENEWAL_PLANS: RenewalPlan[] = [
  { id: "daily",  label: "Daily",    sublabel: "Expires at midnight today", isDaily:  true },
  { id: "walkin", label: "Walk-in",  sublabel: "Custom end date",           isWalkin: true },
  { id: "1m",     label: "1 Month",  sublabel: "30-day access",             months: 1  },
  { id: "6m",     label: "6 Months", sublabel: "6-month access",            months: 6  },
  { id: "1y",     label: "1 Year",   sublabel: "Full year access",          months: 12 },
]

type PlanPrices = Record<RenewalPlanId, string>

type PaymentForm = {
  payment_method:   PaymentMethod | ""
  payment_for:      PaymentFor | ""
  reference_number: string
  notes:            string
}

type RenewalState = {
  user:          UserType
  subscription:  Subscription | null
  prices:        PlanPrices
  selectedPlan:  RenewalPlanId | null
  customEndDate: string
  paymentForm:   PaymentForm
  step:          "select" | "confirm" | "check-in"
  isProcessing:  boolean
  paymentError:  string
}

// ─── Other types ──────────────────────────────────────────────────────────────
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
const generateId = () =>
  `pay_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash:         "Cash",
  gcash:        "GCash",
  paymaya:      "PayMaya",
  banktransfer: "Bank Transfer",
}

const PAYMENT_FOR_LABELS: Record<PaymentFor, string> = {
  membership: "Membership",
  coaching:   "Coaching",
  both:       "Both",
  other:      "Other",
}

// Compute end date based on plan type
const computeNewEndDate = (plan: RenewalPlan, customEndDate: string): Date => {
  const now = new Date()
  if (plan.isDaily) {
    // Midnight of the next day = end of today
    return addDays(startOfDay(now), 1)
  }
  if (plan.isWalkin) {
    return new Date(customEndDate)
  }
  return addMonths(now, plan.months ?? 1)
}

// ─── Component ────────────────────────────────────────────────────────────────
export function ScannerInterface() {
  const [lastScan, setLastScan] = useState<ScanResult | null>(null)
  const [duplicateScan, setDuplicateScan] = useState<DuplicateScan | null>(null)
  const [activeSessions, setActiveSessions] = useState(0)
  const [todayCheckIns, setTodayCheckIns] = useState(0)
  const [totalMembers, setTotalMembers] = useState(0)
  const scanCooldowns = useRef<Map<string, number>>(new Map())
  const [monthlyCount, setMonthlyCount] = useState(0)
  const [dailyCount, setDailyCount] = useState(0)
  const [walkinCount, setWalkinCount] = useState(0)
  const [showMembersDialog, setShowMembersDialog] = useState(false)
  const [membersWithStats, setMembersWithStats] = useState<MemberWithStats[]>([])
  const [isLoadingMembers, setIsLoadingMembers] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [hoursView, setHoursView] = useState<HoursView>("week")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [membershipFilter, setMembershipFilter] = useState<MembershipFilter>("all")
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  )
  const [pendingSyncCount, setPendingSyncCount] = useState(0)
  const [renewal, setRenewal] = useState<RenewalState | null>(null)

  // ── Renewal helpers ──────────────────────────────────────────────────────
  const emptyPaymentForm = (): PaymentForm => ({
    payment_method:   "",
    payment_for:      "membership",
    reference_number: "",
    notes:            "",
  })

  const openRenewal = (user: UserType, subscription: Subscription | null) => {
    setRenewal({
      user,
      subscription,
      prices:        { daily: "", walkin: "", "1m": "", "6m": "", "1y": "" },
      selectedPlan:  null,
      customEndDate: "",
      paymentForm:   emptyPaymentForm(),
      step:          "select",
      isProcessing:  false,
      paymentError:  "",
    })
    setLastScan(null)
  }

  const closeRenewal = () => setRenewal(null)

  const updatePaymentForm = (patch: Partial<PaymentForm>) =>
    setRenewal(prev =>
      prev ? { ...prev, paymentForm: { ...prev.paymentForm, ...patch }, paymentError: "" } : null
    )

  const needsReference =
    renewal &&
    ["gcash", "paymaya", "banktransfer"].includes(renewal.paymentForm.payment_method)

  const validatePayment = (): string => {
    if (!renewal) return ""
    if (!renewal.selectedPlan)
      return "Please select a plan."
    if (!renewal.prices[renewal.selectedPlan] || parseFloat(renewal.prices[renewal.selectedPlan]) <= 0)
      return "Please enter a valid price for the selected plan."
    const plan = RENEWAL_PLANS.find(p => p.id === renewal.selectedPlan)
    if (plan?.isWalkin && !renewal.customEndDate)
      return "Please select an end date for the walk-in plan."
    if (plan?.isWalkin && new Date(renewal.customEndDate) <= new Date())
      return "Walk-in end date must be in the future."
    if (!renewal.paymentForm.payment_method)
      return "Please select a payment method."
    if (!renewal.paymentForm.payment_for)
      return "Please select what this payment is for."
    if (
      ["gcash", "paymaya", "banktransfer"].includes(renewal.paymentForm.payment_method) &&
      !renewal.paymentForm.reference_number.trim()
    )
      return "A reference number is required for non-cash payments."
    return ""
  }

  const handleRenewConfirm = async () => {
    const err = validatePayment()
    if (err) { setRenewal(prev => prev ? { ...prev, paymentError: err } : null); return }
    if (!renewal || !renewal.selectedPlan) return

    setRenewal(prev => prev ? { ...prev, isProcessing: true } : null)

    const plan   = RENEWAL_PLANS.find(p => p.id === renewal.selectedPlan)!
    const now    = new Date()
    const newEnd = computeNewEndDate(plan, renewal.customEndDate)
    const amount = parseFloat(renewal.prices[renewal.selectedPlan])

    // 1. Update subscription
    const updatedSub: Subscription = {
      ...(renewal.subscription ?? {}),
      userId:    renewal.user.userId,
      startDate: now.toISOString(),
      endDate:   newEnd.toISOString(),
      planId:    plan.id,
    } as Subscription

    await storageService.addOrUpdateSubscription(updatedSub)

    // 2. Save payment record
    const nowIso = now.toISOString()
    await storageService.addPayment({
      paymentId:       generateId(),
      userId:          renewal.user.userId,
      amount,
      paymentMethod:   renewal.paymentForm.payment_method as PaymentMethod,
      paymentDate:     nowIso,
      referenceNumber: renewal.paymentForm.reference_number.trim(),
      notes:           renewal.paymentForm.notes.trim(),
      paymentFor:      renewal.paymentForm.payment_for as PaymentFor,
      createdAt:       nowIso,
      updatedAt:       nowIso,
    } as unknown as Payment)

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

  // ── Shared helpers ───────────────────────────────────────────────────────
  const formatDate = (date?: string) => {
    if (!date) return "—"
    return new Date(date).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })
  }

  const formatDateComputed = (d: Date | null) => {
    if (!d || isNaN(d.getTime())) return "—"
    return d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })
  }

  const getRemainingDays = (sub?: Subscription | null) => {
    if (!sub) return 0
    return Math.ceil((new Date(sub.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
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
    if (hours < 1) return `${Math.round(ms / (1000 * 60))}m`
    return `${hours.toFixed(1)}h`
  }

  const formatLastUpdate = (date: Date) => {
    const diffSeconds = Math.floor((new Date().getTime() - date.getTime()) / 1000)
    if (diffSeconds < 10) return "Just now"
    if (diffSeconds < 60) return `${diffSeconds}s ago`
    const diffMinutes = Math.floor(diffSeconds / 60)
    if (diffMinutes < 60) return `${diffMinutes}m ago`
    return date.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })
  }

  const getMembershipType = (subscription: Subscription | null): MembershipType => {
    if (!subscription) return "unknown"
    const start = new Date(subscription.startDate)
    const end   = new Date(subscription.endDate)
    const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
    if (end.getHours() === 0 && end.getMinutes() === 0 && durationHours <= 24) return "daily"
    const months =
      (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
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
        if (log.action === "check-out" && lastIn) {
          totalMs += t.getTime() - lastIn.getTime()
          lastIn = null
        }
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
    const [users, allSubscriptions] = await Promise.all([
      storageService.getUsers(),
      storageService.getSubscriptions(),
    ])
    const subscriptionMap = new Map(allSubscriptions.map(sub => [sub.userId, sub]))
    const membersData: MemberWithStats[] = users.map(user => {
      const subscription   = subscriptionMap.get(user.userId) || null
      const isActive       = subscriptionService.isSubscriptionActive(subscription)
      const membershipType = getMembershipType(subscription)
      return {
        user, subscription, isActive, membershipType,
        gymHours: { today: 0, week: 0, month: 0, year: 0, all: 0 },
      }
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
        const index   = updated.findIndex(m => m.user.userId === member.user.userId)
        if (index !== -1) updated[index] = { ...updated[index], gymHours }
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
      const subscriptionMap = new Map(allSubscriptions.map(sub => [sub.userId, sub]))
      let monthly = 0, daily = 0, walkin = 0
      for (const user of users) {
        const type = getMembershipType(subscriptionMap.get(user.userId) || null)
        if (type === "monthly") monthly++
        else if (type === "daily") daily++
        else if (type === "walkin") walkin++
      }
      setMonthlyCount(monthly)
      setDailyCount(daily)
      setWalkinCount(walkin)
      setLastUpdate(new Date())
      setIsOnline(true)
    } catch {
      setIsOnline(false)
    }
  }

  const handleScan = async (code: string) => {
    const userId      = code.trim()
    const lastScanTime = scanCooldowns.current.get(userId)
    const now         = Date.now()
    if (lastScanTime) {
      const secondsElapsed = (now - lastScanTime) / 1000
      if (secondsElapsed < SCAN_COOLDOWN_SECONDS) {
        const cooldownLeft = Math.ceil(SCAN_COOLDOWN_SECONDS - secondsElapsed)
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
      speakCheckIn(name || "member")
      scanCooldowns.current.set(userId, now)
    } else if (result.log?.action === "check-out") {
      speakCheckOut(name || "member")
      scanCooldowns.current.set(userId, now)
    }

    setLastScan({ ...result, subscription, user })
    setPendingSyncCount(offlineQueue.getPendingCount())
    updateStats()
  }

  const { isScanning } = useQRScanner(handleScan)

  useEffect(() => {
    updateStats()
    const i = setInterval(updateStats, 5000)
    return () => clearInterval(i)
  }, [])

  useEffect(() => { if (showMembersDialog) loadMembersWithStats() }, [showMembersDialog])

  useEffect(() => {
    const enter = () => {
      if (!document.fullscreenElement)
        document.documentElement.requestFullscreen().catch(() => {})
      window.removeEventListener("click", enter)
    }
    window.addEventListener("click", enter)
    return () => window.removeEventListener("click", enter)
  }, [])

  useEffect(() => {
    if (!lastScan) return
    const t = setTimeout(() => setLastScan(null), 5000)
    return () => clearTimeout(t)
  }, [lastScan])

  useEffect(() => {
    if (!duplicateScan) return
    const t = setTimeout(() => setDuplicateScan(null), 3000)
    return () => clearTimeout(t)
  }, [duplicateScan])

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true)
      const { synced } = await offlineQueue.flushQueue()
      if (synced > 0) console.log(`Synced ${synced} offline items`)
      setPendingSyncCount(offlineQueue.getPendingCount())
      updateStats()
    }
    const handleOffline = () => setIsOnline(false)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    setPendingSyncCount(offlineQueue.getPendingCount())
    if (navigator.onLine && offlineQueue.getPendingCount() > 0)
      offlineQueue.flushQueue().then(() => setPendingSyncCount(offlineQueue.getPendingCount()))
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  const handleMembersCardClick = (filter?: MembershipFilter) => {
    setMembershipFilter(filter || "all")
    setShowMembersDialog(true)
  }

  const filteredMembers = membersWithStats.filter(member => {
    const matchesSearch =
      searchTerm === "" ||
      member.user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.user.userId.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && member.isActive) ||
      (statusFilter === "expired" && !member.isActive)
    const matchesMembership =
      membershipFilter === "all" || member.membershipType === membershipFilter
    return matchesSearch && matchesStatus && matchesMembership
  })

  const activeCount          = membersWithStats.filter(m => m.isActive).length
  const expiredCount         = membersWithStats.filter(m => !m.isActive).length
  const filteredMonthlyCount = membersWithStats.filter(m => m.membershipType === "monthly").length
  const filteredDailyCount   = membersWithStats.filter(m => m.membershipType === "daily").length
  const filteredWalkinCount  = membersWithStats.filter(m => m.membershipType === "walkin").length

  const selectedPlanObj = renewal ? RENEWAL_PLANS.find(p => p.id === renewal.selectedPlan) : null
  const renewalNewEnd   = selectedPlanObj
    ? computeNewEndDate(selectedPlanObj, renewal?.customEndDate ?? "")
    : null

  // Minimum date for walk-in picker (tomorrow)
  const minWalkinDate = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().split("T")[0]
  })()

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Status bar */}
      <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
        {isOnline
          ? <Wifi className="w-3 h-3 text-emerald-500" />
          : <WifiOff className="w-3 h-3 text-red-500" />}
        <span>{isOnline ? "Live" : "Offline"} • Updated {formatLastUpdate(lastUpdate)}</span>
        {pendingSyncCount > 0 && (
          <span className="flex items-center gap-1 text-yellow-500">
            <CloudOff className="w-3 h-3" />{pendingSyncCount} pending sync
          </span>
        )}
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <Card className="p-3 md:p-6">
          <p className="text-xs md:text-sm text-muted-foreground">Active Now</p>
          <p className="text-xl md:text-2xl font-bold">{activeSessions}</p>
        </Card>
        <Card className="p-3 md:p-6">
          <p className="text-xs md:text-sm text-muted-foreground">Today's Check-ins</p>
          <p className="text-xl md:text-2xl font-bold">{todayCheckIns}</p>
        </Card>
        <Card className="p-3 md:p-6 cursor-pointer hover:bg-zinc-800/50 transition-colors group"
          onClick={() => handleMembersCardClick("all")}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-3">
              <Users className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground hidden sm:block" />
              <div>
                <p className="text-xs md:text-sm text-muted-foreground">Total Members</p>
                <p className="text-xl md:text-2xl font-bold">{totalMembers}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
        </Card>
      </div>

      {/* Membership type cards */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <Card className="p-3 md:p-6 cursor-pointer hover:bg-zinc-800/50 transition-colors group border-l-4 border-l-primary"
          onClick={() => handleMembersCardClick("monthly")}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-3">
              <CalendarDays className="w-4 h-4 md:w-5 md:h-5 text-primary hidden sm:block" />
              <div>
                <p className="text-xs md:text-sm text-muted-foreground">Monthly</p>
                <p className="text-xl md:text-2xl font-bold">{monthlyCount}</p>
                <p className="text-[10px] md:text-xs text-muted-foreground hidden sm:block">1m, 6m, 1 year plans</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground group-hover:text-foreground transition-colors hidden sm:block" />
          </div>
        </Card>
        <Card className="p-3 md:p-6 cursor-pointer hover:bg-zinc-800/50 transition-colors group border-l-4 border-l-purple-600"
          onClick={() => handleMembersCardClick("daily")}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-3">
              <Calendar className="w-4 h-4 md:w-5 md:h-5 text-purple-600 hidden sm:block" />
              <div>
                <p className="text-xs md:text-sm text-muted-foreground">Daily</p>
                <p className="text-xl md:text-2xl font-bold">{dailyCount}</p>
                <p className="text-[10px] md:text-xs text-muted-foreground hidden sm:block">Expires at midnight</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground group-hover:text-foreground transition-colors hidden sm:block" />
          </div>
        </Card>
        <Card className="p-3 md:p-6 cursor-pointer hover:bg-zinc-800/50 transition-colors group border-l-4 border-l-blue-600"
          onClick={() => handleMembersCardClick("walkin")}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-3">
              <CalendarClock className="w-4 h-4 md:w-5 md:h-5 text-blue-600 hidden sm:block" />
              <div>
                <p className="text-xs md:text-sm text-muted-foreground">Walk-in</p>
                <p className="text-xl md:text-2xl font-bold">{walkinCount}</p>
                <p className="text-[10px] md:text-xs text-muted-foreground hidden sm:block">Custom date range</p>
              </div>
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
        <h2 className="text-2xl md:text-3xl font-bold mt-4 md:mt-6">
          {isScanning ? "Scanning..." : "Ready to Scan"}
        </h2>
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
                : `${getMembershipLabel(membershipFilter)} Members (${
                    membershipFilter === "monthly" ? monthlyCount
                    : membershipFilter === "daily" ? dailyCount
                    : walkinCount
                  })`}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col sm:flex-row gap-3 py-3 border-b">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by name or ID..." value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
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
              <div className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">Loading members...</p>
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">No members found</p>
              </div>
            ) : (
              filteredMembers.map(member => (
                <Card key={member.user.userId} className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold truncate">{member.user.name}</span>
                        <span className="text-xs text-muted-foreground font-mono">{member.user.userId}</span>
                        <Badge variant={member.isActive ? "default" : "destructive"}>
                          {member.isActive ? "Active" : "Expired"}
                        </Badge>
                        {getMembershipBadge(member.membershipType)}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {member.subscription && (
                          <>
                            <span>Expires: {formatDate(member.subscription.endDate)}</span>
                            {member.isActive && <span>({getRemainingDays(member.subscription)} days left)</span>}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-right">
                      <Timer className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="font-bold text-lg">{formatHours(member.gymHours[hoursView])}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">
                          {hoursView === "all" ? "All Time" : `This ${hoursView}`}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 md:gap-4 mt-3 pt-3 border-t text-[10px] md:text-xs">
                    {(["today", "week", "month", "year", "all"] as HoursView[]).map(v => (
                      <div key={v} className="flex-1 text-center">
                        <p className="text-muted-foreground capitalize">
                          {v === "all" ? "All" : v.charAt(0).toUpperCase() + v.slice(1)}
                        </p>
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

      {/* ── Duplicate scan popup ───────────────────────────────────────────── */}
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

      {/* ── Scan result popup ──────────────────────────────────────────────── */}
      {lastScan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
          <Card className="w-full max-w-xl p-5 md:p-8 bg-white rounded-xl shadow-2xl border">
            <div className="flex gap-4 md:gap-6">
              <div className="flex-1 min-w-0">
                <h2 className={`text-2xl md:text-3xl font-bold ${lastScan.success ? "text-gold-600" : "text-black-600"}`}>
                  {lastScan.message}
                </h2>
                <p className="text-base md:text-lg font-bold mt-1 truncate">
                  {lastScan.user?.name || lastScan.log?.userName || "Unknown User"}
                </p>
                <p className="text-xs md:text-sm text-white-600 truncate">ID: {lastScan.log?.userId}</p>
                <div className="mt-2">
                  {lastScan.subscription && getMembershipBadge(getMembershipType(lastScan.subscription))}
                </div>
                <div className="mt-3 md:mt-4">
                  {(() => {
                    const status = getExpiryStatus(lastScan.subscription)
                    const days   = getRemainingDays(lastScan.subscription)
                    if (status === "expired")
                      return <Badge variant="destructive">🔴 Expired</Badge>
                    if (status === "soon")
                      return <Badge className="bg-yellow-400 text-black">🟡 Expiring Soon ({days} days)</Badge>
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

      {/* ── RENEWAL POPUP ──────────────────────────────────────────────────── */}
      {renewal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <Card className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-red-200 overflow-hidden">

            {/* Header */}
            <div className="bg-red-50 px-6 py-5 border-b border-red-100">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-red-100">
                  <RefreshCw className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-red-700">Membership Expired</h2>
                  <p className="text-sm text-red-500 font-medium">
                    {renewal.user.name} · ID: {renewal.user.userId}
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5 space-y-5 max-h-[72vh] overflow-y-auto">

              {/* ── STEP 1: Select plan + payment ── */}
              {renewal.step === "select" && (
                <>
                  <p className="text-sm text-gray-600">
                    Select a renewal plan, enter the price, and complete the payment details.
                  </p>

                  {/* Plan rows */}
                  <div className="space-y-2">
                    {RENEWAL_PLANS.map(plan => (
                      <div key={plan.id}>
                        <div
                          onClick={() =>
                            setRenewal(prev =>
                              prev
                                ? { ...prev, selectedPlan: plan.id, customEndDate: "", paymentError: "" }
                                : null
                            )
                          }
                          className={`flex items-center justify-between gap-4 rounded-xl border-2 p-4 cursor-pointer transition-all ${
                            renewal.selectedPlan === plan.id
                              ? "border-primary bg-primary/5"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          {/* Radio + label */}
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-4 h-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                              renewal.selectedPlan === plan.id ? "border-primary" : "border-gray-300"
                            }`}>
                              {renewal.selectedPlan === plan.id && (
                                <div className="w-2 h-2 rounded-full bg-primary" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-800 leading-tight">{plan.label}</p>
                              <p className="text-xs text-gray-400 leading-tight">{plan.sublabel}</p>
                            </div>
                          </div>

                          {/* Price input */}
                          <div
                            className="flex items-center gap-1.5 shrink-0"
                            onClick={e => e.stopPropagation()}
                          >
                            <span className="text-sm font-medium text-gray-500">₱</span>
                            <Input
                              type="number"
                              min="0"
                              placeholder="0.00"
                              value={renewal.prices[plan.id]}
                              onChange={e =>
                                setRenewal(prev =>
                                  prev
                                    ? {
                                        ...prev,
                                        prices: { ...prev.prices, [plan.id]: e.target.value },
                                        paymentError: "",
                                      }
                                    : null
                                )
                              }
                              className="w-28 text-right font-mono"
                            />
                          </div>
                        </div>

                        {/* Walk-in custom end date — shown inline below when selected */}
                        {plan.isWalkin && renewal.selectedPlan === "walkin" && (
                          <div className="mt-2 ml-4 flex items-center gap-3">
                            <Label className="text-sm font-medium text-gray-700 whitespace-nowrap shrink-0">
                              End Date <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              type="date"
                              min={minWalkinDate}
                              value={renewal.customEndDate}
                              onChange={e =>
                                setRenewal(prev =>
                                  prev
                                    ? { ...prev, customEndDate: e.target.value, paymentError: "" }
                                    : null
                                )
                              }
                              className="flex-1"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Payment details divider */}
                  <div className="flex items-center gap-3 pt-1">
                    <div className="flex-1 border-t" />
                    <span className="text-xs text-gray-400 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5" /> Payment Details
                    </span>
                    <div className="flex-1 border-t" />
                  </div>

                  {/* Payment method */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-700">
                      Payment Method <span className="text-red-500">*</span>
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["cash", "gcash", "paymaya", "banktransfer"] as PaymentMethod[]).map(method => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => updatePaymentForm({ payment_method: method, reference_number: "" })}
                          className={`rounded-lg border-2 py-2.5 px-3 text-sm font-medium transition-all text-left ${
                            renewal.paymentForm.payment_method === method
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-gray-200 text-gray-700 hover:border-gray-300"
                          }`}
                        >
                          {PAYMENT_METHOD_LABELS[method]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Payment for */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-700">
                      Payment For <span className="text-red-500">*</span>
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["membership", "coaching",] as PaymentFor[]).map(pf => (
                        <button
                          key={pf}
                          type="button"
                          onClick={() => updatePaymentForm({ payment_for: pf })}
                          className={`rounded-lg border-2 py-2.5 px-3 text-sm font-medium transition-all text-left ${
                            renewal.paymentForm.payment_for === pf
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-gray-200 text-gray-700 hover:border-gray-300"
                          }`}
                        >
                          {PAYMENT_FOR_LABELS[pf]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Reference number */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-gray-700">
                      Reference Number
                      {needsReference
                        ? <span className="text-red-500"> *</span>
                        : <span className="text-gray-400 font-normal"> (optional)</span>}
                    </Label>
                    <Input
                      placeholder={needsReference ? "Required for this payment method" : "Optional"}
                      value={renewal.paymentForm.reference_number}
                      onChange={e => updatePaymentForm({ reference_number: e.target.value })}
                    />
                  </div>

                  {/* Notes */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-gray-700">
                      Notes <span className="text-gray-400 font-normal">(optional)</span>
                    </Label>
                    <Textarea
                      placeholder="Any additional notes..."
                      rows={2}
                      value={renewal.paymentForm.notes}
                      onChange={e => updatePaymentForm({ notes: e.target.value })}
                      className="resize-none"
                    />
                  </div>

                  {/* Validation error */}
                  {renewal.paymentError && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {renewal.paymentError}
                    </p>
                  )}

                  <div className="flex gap-3 pt-1">
                    <Button variant="outline" className="flex-1" onClick={closeRenewal}>
                      <XCircle className="w-4 h-4 mr-2" />Cancel
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={() => {
                        const err = validatePayment()
                        if (err) {
                          setRenewal(prev => prev ? { ...prev, paymentError: err } : null)
                          return
                        }
                        setRenewal(prev => prev ? { ...prev, step: "confirm", paymentError: "" } : null)
                      }}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />Review & Renew
                    </Button>
                  </div>
                </>
              )}

              {/* ── STEP 2: Confirm summary ── */}
              {renewal.step === "confirm" && selectedPlanObj && (
                <>
                  <div className="rounded-xl bg-gray-50 border divide-y text-sm">
                    <div className="flex justify-between px-4 py-3">
                      <span className="text-gray-500">Member</span>
                      <span className="font-semibold">{renewal.user.name}</span>
                    </div>
                    <div className="flex justify-between px-4 py-3">
                      <span className="text-gray-500">Plan</span>
                      <span className="font-semibold">{selectedPlanObj.label}</span>
                    </div>
                    <div className="flex justify-between px-4 py-3">
                      <span className="text-gray-500">Amount</span>
                      <span className="font-semibold text-green-700">
                        ₱{parseFloat(renewal.prices[renewal.selectedPlan!] || "0")
                          .toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between px-4 py-3">
                      <span className="text-gray-500">Method</span>
                      <span className="font-semibold">
                        {PAYMENT_METHOD_LABELS[renewal.paymentForm.payment_method as PaymentMethod]}
                      </span>
                    </div>
                    <div className="flex justify-between px-4 py-3">
                      <span className="text-gray-500">For</span>
                      <span className="font-semibold">
                        {PAYMENT_FOR_LABELS[renewal.paymentForm.payment_for as PaymentFor]}
                      </span>
                    </div>
                    {renewal.paymentForm.reference_number && (
                      <div className="flex justify-between px-4 py-3">
                        <span className="text-gray-500">Ref #</span>
                        <span className="font-semibold font-mono">{renewal.paymentForm.reference_number}</span>
                      </div>
                    )}
                    {renewal.paymentForm.notes && (
                      <div className="flex justify-between px-4 py-3 gap-4">
                        <span className="text-gray-500 shrink-0">Notes</span>
                        <span className="font-semibold text-right">{renewal.paymentForm.notes}</span>
                      </div>
                    )}
                    <div className="flex justify-between px-4 py-3">
                      <span className="text-gray-500">New Expiry</span>
                      <span className="font-semibold">{formatDateComputed(renewalNewEnd)}</span>
                    </div>
                  </div>

                  <p className="text-sm text-gray-500 text-center">
                    Confirm to activate the plan and record the payment.
                  </p>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setRenewal(prev => prev ? { ...prev, step: "select" } : null)}
                      disabled={renewal.isProcessing}
                    >
                      Back
                    </Button>
                    <Button
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      onClick={handleRenewConfirm}
                      disabled={renewal.isProcessing}
                    >
                      {renewal.isProcessing ? "Processing…" : "Confirm & Save Payment"}
                    </Button>
                  </div>
                </>
              )}

              {/* ── STEP 3: Check-in prompt ── */}
              {renewal.step === "check-in" && (
                <>
                  <div className="flex flex-col items-center gap-3 py-2">
                    <div className="p-3 rounded-full bg-green-100">
                      <CheckCircle2 className="w-8 h-8 text-green-600" />
                    </div>
                    <h3 className="text-lg font-bold text-green-700">Renewal &amp; Payment Saved!</h3>
                    <p className="text-sm text-gray-600 text-center">
                      <span className="font-semibold">{renewal.user.name}</span>'s membership is now active
                      until{" "}
                      <span className="font-semibold">
                        {renewal.subscription ? formatDate(renewal.subscription.endDate) : "—"}
                      </span>.
                    </p>
                    <p className="text-sm text-gray-500 mt-1">Would you like to check them in now?</p>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={closeRenewal}>
                      Not Now
                    </Button>
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