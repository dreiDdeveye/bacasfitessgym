"use client"

import { useState, useEffect, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  CreditCard,
  CheckCircle2,
  DollarSign,
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
  addDays,
  addMonths,
  addHours,
} from "date-fns"

const SCAN_COOLDOWN_SECONDS = 60

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
type MembershipFilter = "all" | "monthly" | "daily" | "walkin"

type SubscriptionTypeOption = {
  id: string
  label: string
  duration: number
  unit: "day" | "month" | "hour"
  suggestedPrice?: string
}

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
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true)
  const [pendingSyncCount, setPendingSyncCount] = useState(0)
  
  // Renewal feature states
  const [showRenewalDialog, setShowRenewalDialog] = useState(false)
  const [renewalUser, setRenewalUser] = useState<UserType | null>(null)
  const [selectedSubType, setSelectedSubType] = useState<string>("")
  const [amount, setAmount] = useState<string>("")
  const [isPaid, setIsPaid] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "gcash" | "paymaya" | "banktransfer">("cash")
  const [isProcessingRenewal, setIsProcessingRenewal] = useState(false)

  // Subscription type options
  const subscriptionTypes: SubscriptionTypeOption[] = [
    { id: "daily", label: "Daily Pass", duration: 1, unit: "day", suggestedPrice: "100" },
    { id: "monthly-1", label: "1 Month", duration: 1, unit: "month", suggestedPrice: "1500" },
    { id: "monthly-6", label: "6 Months", duration: 6, unit: "month", suggestedPrice: "8000" },
    { id: "monthly-12", label: "12 Months (1 Year)", duration: 12, unit: "month", suggestedPrice: "15000" },
    { id: "walkin-4h", label: "Walk-in 4 Hours", duration: 4, unit: "hour", suggestedPrice: "80" },
    { id: "walkin-8h", label: "Walk-in 8 Hours", duration: 8, unit: "hour", suggestedPrice: "150" },
  ]

  const formatDate = (date?: string) => {
    if (!date) return "—"
    return new Date(date).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })
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
    const end = new Date(subscription.endDate)
    const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
    if (end.getHours() === 0 && end.getMinutes() === 0 && durationHours <= 24) return "daily"
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
    if ([1, 6, 12].includes(months)) return "monthly"
    return "walkin"
  }

  const getMembershipLabel = (type: MembershipType) => {
    return { monthly: "Monthly", daily: "Daily", walkin: "Walk-in", unknown: "Unknown" }[type]
  }

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
    const now = new Date()
    const sorted = logs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    const calc = (periodStart: Date | null) => {
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
        const index = updated.findIndex(m => m.user.userId === member.user.userId)
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

  const handleRenewal = (user: UserType) => {
    setRenewalUser(user)
    setSelectedSubType("")
    setAmount("")
    setIsPaid(false)
    setPaymentMethod("cash")
    setShowRenewalDialog(true)
  }

  const processRenewal = async () => {
    if (!renewalUser || !selectedSubType || !amount) {
      alert("Please select a subscription plan and enter an amount")
      return
    }

    // Validate amount
    const numAmount = parseFloat(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      alert("Please enter a valid amount greater than 0")
      return
    }

    setIsProcessingRenewal(true)

    try {
      const subTypeOption = subscriptionTypes.find(st => st.id === selectedSubType)
      if (!subTypeOption) throw new Error("Invalid subscription type")

      const now = new Date()
      let endDate: Date

      // Calculate end date based on subscription type
      switch (subTypeOption.unit) {
        case "hour":
          endDate = addHours(now, subTypeOption.duration)
          break
        case "day":
          endDate = addDays(now, subTypeOption.duration)
          // For daily pass, set to end of day
          endDate.setHours(23, 59, 59, 999)
          break
        case "month":
          endDate = addMonths(now, subTypeOption.duration)
          break
      }

      // Determine membership type and plan duration
      let membershipType: "monthly" | "daily" | "walkin" = "walkin"
      let planDuration: string | undefined

      if (subTypeOption.unit === "day") {
        membershipType = "daily"
        planDuration = "1 day"
      } else if (subTypeOption.unit === "month") {
        membershipType = "monthly"
        planDuration = `${subTypeOption.duration} month${subTypeOption.duration > 1 ? "s" : ""}`
      } else if (subTypeOption.unit === "hour") {
        membershipType = "walkin"
        planDuration = `${subTypeOption.duration} hours`
      }

      // Create new subscription with ACTIVE status
      const newSubscription: Subscription = {
        userId: renewalUser.userId,
        startDate: now.toISOString(),
        endDate: endDate.toISOString(),
        status: "active", // Automatically activate
        planDuration: planDuration,
        membershipType: membershipType,
        coachingPreference: false,
        paymentStatus: isPaid ? "paid" : "not paid",
        paymentDate: isPaid ? now.toISOString() : undefined,
        createdAt: now.toISOString(),
      }

      // Save subscription using the correct method
      await storageService.addOrUpdateSubscription(newSubscription)

      // Create payment record if marked as paid
      if (isPaid) {
        const paymentId = await storageService.generatePaymentId()
        
        const payment: Payment = {
          paymentId: paymentId,
          userId: renewalUser.userId,
          amount: numAmount,
          paymentMethod: paymentMethod,
          paymentDate: now.toISOString(),
          paymentFor: "membership",
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        }

        await storageService.addPayment(payment)
      }

      // Update stats
      await updateStats()

      // Close dialog
      setShowRenewalDialog(false)
      setLastScan(null)

      // Show success message
      const paymentInfo = isPaid 
        ? `\n\nPayment Details:\n• Amount: ₱${numAmount.toFixed(2)}\n• Method: ${paymentMethod.toUpperCase()}\n• Status: PAID ✓`
        : '\n\nPayment Status: UNPAID ✗'

      alert(`✅ Renewal Successful!\n\nMember: ${renewalUser.name}\nPlan: ${subTypeOption.label}\nValid Until: ${formatDate(endDate.toISOString())}\nStatus: ACTIVE ✓${paymentInfo}`)

    } catch (error) {
      console.error("Renewal error:", error)
      alert("❌ Failed to process renewal. Please try again.\n\nError: " + (error instanceof Error ? error.message : "Unknown error"))
    } finally {
      setIsProcessingRenewal(false)
    }
  }

  const handleScan = async (code: string) => {
    const userId = code.trim()

    // Cooldown check
    const lastScanTime = scanCooldowns.current.get(userId)
    const now = Date.now()
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
      user = await storageService.getUserById(result.log.userId)
    }

    const name = user?.name || result.log?.userName

    if (!result.success) {
      playLongBeep(5)
      speakExpired(name)
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
    const interval = setInterval(updateStats, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => { if (showMembersDialog) loadMembersWithStats() }, [showMembersDialog])

  useEffect(() => {
    const enterFullscreen = () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {})
      window.removeEventListener("click", enterFullscreen)
    }
    window.addEventListener("click", enterFullscreen)
    return () => window.removeEventListener("click", enterFullscreen)
  }, [])

  useEffect(() => { if (!lastScan) return; const t = setTimeout(() => setLastScan(null), 8000); return () => clearTimeout(t) }, [lastScan])
  useEffect(() => { if (!duplicateScan) return; const t = setTimeout(() => setDuplicateScan(null), 3000); return () => clearTimeout(t) }, [duplicateScan])

  // Auto-fill suggested price when subscription type is selected
  useEffect(() => {
    if (selectedSubType) {
      const subType = subscriptionTypes.find(st => st.id === selectedSubType)
      if (subType?.suggestedPrice) {
        setAmount(subType.suggestedPrice)
      }
    }
  }, [selectedSubType])

  // Network detection + offline sync
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
    if (navigator.onLine && offlineQueue.getPendingCount() > 0) {
      offlineQueue.flushQueue().then(() => {
        setPendingSyncCount(offlineQueue.getPendingCount())
      })
    }

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
    const matchesSearch = searchTerm === "" || member.user.name.toLowerCase().includes(searchTerm.toLowerCase()) || member.user.userId.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" && member.isActive) || (statusFilter === "expired" && !member.isActive)
    const matchesMembership = membershipFilter === "all" || member.membershipType === membershipFilter
    return matchesSearch && matchesStatus && matchesMembership
  })

  const activeCount  = membersWithStats.filter(m => m.isActive).length
  const expiredCount = membersWithStats.filter(m => !m.isActive).length
  const filteredMonthlyCount = membersWithStats.filter(m => m.membershipType === "monthly").length
  const filteredDailyCount   = membersWithStats.filter(m => m.membershipType === "daily").length
  const filteredWalkinCount  = membersWithStats.filter(m => m.membershipType === "walkin").length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
        {isOnline ? (
          <Wifi className="w-3 h-3 text-emerald-500" />
        ) : (
          <WifiOff className="w-3 h-3 text-red-500" />
        )}
        <span>{isOnline ? "Live" : "Offline"} • Updated {formatLastUpdate(lastUpdate)}</span>
        {pendingSyncCount > 0 && (
          <span className="flex items-center gap-1 text-yellow-500">
            <CloudOff className="w-3 h-3" />
            {pendingSyncCount} pending sync
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <Card className="p-3 md:p-6">
          <p className="text-xs md:text-sm text-muted-foreground">Active Now</p>
          <p className="text-xl md:text-2xl font-bold">{activeSessions}</p>
        </Card>
        <Card className="p-3 md:p-6">
          <p className="text-xs md:text-sm text-muted-foreground">Today's Check-ins</p>
          <p className="text-xl md:text-2xl font-bold">{todayCheckIns}</p>
        </Card>
        <Card className="p-3 md:p-6 cursor-pointer hover:bg-zinc-800/50 transition-colors group" onClick={() => handleMembersCardClick("all")}>
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

      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <Card className="p-3 md:p-6 cursor-pointer hover:bg-zinc-800/50 transition-colors group border-l-4 border-l-primary" onClick={() => handleMembersCardClick("monthly")}>
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
        <Card className="p-3 md:p-6 cursor-pointer hover:bg-zinc-800/50 transition-colors group border-l-4 border-l-purple-600" onClick={() => handleMembersCardClick("daily")}>
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
        <Card className="p-3 md:p-6 cursor-pointer hover:bg-zinc-800/50 transition-colors group border-l-4 border-l-blue-600" onClick={() => handleMembersCardClick("walkin")}>
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

      <Card className="p-6 md:p-10 flex flex-col items-center justify-center min-h-[250px] md:min-h-[350px]">
        <div className={`p-6 md:p-10 rounded-full ${isScanning ? "bg-primary/20 animate-pulse" : "bg-muted"}`}>
          <ScanLine className="w-12 h-12 md:w-20 md:h-20 text-primary" />
        </div>
        <h2 className="text-2xl md:text-3xl font-bold mt-4 md:mt-6">{isScanning ? "Scanning..." : "Ready to Scan"}</h2>
        <p className="text-muted-foreground mt-2 text-sm md:text-base">Present QR Code to Scanner</p>
      </Card>

      {/* MEMBERS DIALOG - keeping original code */}
      <Dialog open={showMembersDialog} onOpenChange={setShowMembersDialog}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col w-[95vw] md:w-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {membershipFilter === "all"
                ? `All Members (${totalMembers})`
                : `${getMembershipLabel(membershipFilter)} Members (${membershipFilter === "monthly" ? monthlyCount : membershipFilter === "daily" ? dailyCount : walkinCount})`
              }
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

      {/* RENEWAL DIALOG - SIMPLIFIED */}
      <Dialog open={showRenewalDialog} onOpenChange={setShowRenewalDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-primary" />
              Renew Membership
            </DialogTitle>
            <DialogDescription>
              Select a subscription plan and enter payment details for {renewalUser?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* User Info */}
            <div className="p-4 bg-muted rounded-lg">
              <p className="font-semibold text-lg">{renewalUser?.name}</p>
              <p className="text-sm text-muted-foreground">ID: {renewalUser?.userId}</p>
            </div>

            {/* Subscription Type Selection */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">Select Subscription Plan</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {subscriptionTypes.map((subType) => (
                  <Card
                    key={subType.id}
                    className={`p-4 cursor-pointer transition-all hover:border-primary ${
                      selectedSubType === subType.id ? "border-primary border-2 bg-primary/5" : ""
                    }`}
                    onClick={() => setSelectedSubType(subType.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold">{subType.label}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {subType.duration} {subType.unit}{subType.duration > 1 ? "s" : ""}
                        </p>
                        {subType.suggestedPrice && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Suggested: ₱{subType.suggestedPrice}
                          </p>
                        )}
                      </div>
                      {selectedSubType === subType.id && (
                        <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            {/* Amount Input */}
            <div className="space-y-2">
              <Label htmlFor="amount" className="text-base font-semibold">
                <DollarSign className="w-4 h-4 inline mr-1" />
                Amount (₱)
              </Label>
              <Input
                id="amount"
                type="number"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0"
                step="0.01"
                className="text-lg"
              />
              <p className="text-xs text-muted-foreground">
                Enter the actual amount being charged
              </p>
            </div>

            {/* Payment Status Toggle */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">Payment Status</Label>
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CreditCard className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Mark as Paid</p>
                      <p className="text-sm text-muted-foreground">
                        Has the customer completed payment?
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label 
                      htmlFor="payment-status" 
                      className={`font-semibold ${isPaid ? "text-emerald-600" : "text-red-600"}`}
                    >
                      {isPaid ? "PAID" : "UNPAID"}
                    </Label>
                    <Checkbox
                      id="payment-status"
                      checked={isPaid}
                      onCheckedChange={(checked) => setIsPaid(checked as boolean)}
                      className="w-6 h-6"
                    />
                  </div>
                </div>
              </Card>
            </div>

            {/* Payment Method (only shown if paid) */}
            {isPaid && (
              <div className="space-y-3 p-4 border rounded-lg bg-emerald-50/10">
                <h3 className="font-semibold text-emerald-700">Payment Method</h3>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="gcash">GCash</SelectItem>
                    <SelectItem value="paymaya">PayMaya</SelectItem>
                    <SelectItem value="banktransfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Summary */}
            {selectedSubType && amount && (
              <Card className="p-4 bg-primary/5 border-primary">
                <p className="font-semibold mb-3">Renewal Summary</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Member:</span>
                    <span className="font-medium">{renewalUser?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Plan:</span>
                    <span className="font-medium">
                      {subscriptionTypes.find(st => st.id === selectedSubType)?.label}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount:</span>
                    <span className="font-medium text-lg">₱{parseFloat(amount || "0").toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-muted-foreground">Payment Status:</span>
                    <span className={`font-semibold ${isPaid ? "text-emerald-600" : "text-red-600"}`}>
                      {isPaid ? "PAID ✓" : "UNPAID ✗"}
                    </span>
                  </div>
                  {isPaid && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Method:</span>
                      <span className="font-medium">{paymentMethod.toUpperCase()}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">QR Status:</span>
                    <span className="font-semibold text-emerald-600">WILL BE ACTIVATED ✓</span>
                  </div>
                </div>
              </Card>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowRenewalDialog(false)} 
              disabled={isProcessingRenewal}
            >
              Cancel
            </Button>
            <Button 
              onClick={processRenewal} 
              disabled={!selectedSubType || !amount || parseFloat(amount || "0") <= 0 || isProcessingRenewal}
              className="gap-2"
            >
              {isProcessingRenewal ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Confirm Renewal
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DUPLICATE SCAN POPUP */}
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

      {/* SCAN RESULT POPUP */}
      {lastScan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
          <Card className="w-full max-w-xl p-5 md:p-8 bg-white rounded-xl shadow-2xl border">
            <div className="flex gap-4 md:gap-6">
              <div className="flex-1 min-w-0">
                <h2 className={`text-2xl md:text-3xl font-bold ${lastScan.success ? "text-emerald-600" : "text-red-600"}`}>
                  {lastScan.message}
                </h2>
                <p className="text-base md:text-lg font-bold mt-1 truncate text-gray-900">
                  {lastScan.user?.name || lastScan.log?.userName || "Unknown User"}
                </p>
                <p className="text-xs md:text-sm text-gray-600 truncate">ID: {lastScan.log?.userId}</p>
                <div className="mt-2">
                  {lastScan.subscription && getMembershipBadge(getMembershipType(lastScan.subscription))}
                </div>
                <div className="mt-3 md:mt-4">
                  {(() => {
                    const status = getExpiryStatus(lastScan.subscription)
                    const days   = getRemainingDays(lastScan.subscription)
                    if (status === "expired") return (
                      <div className="space-y-3">
                        <Badge variant="destructive" className="text-base px-3 py-1">🔴 Expired</Badge>
                        {lastScan.user && (
                          <Button 
                            onClick={() => handleRenewal(lastScan.user!)} 
                            className="w-full gap-2"
                            size="lg"
                          >
                            <RefreshCw className="w-4 h-4" />
                            Renew Membership
                          </Button>
                        )}
                      </div>
                    )
                    if (status === "soon") return <Badge className="bg-yellow-400 text-black text-base px-3 py-1">🟡 Expiring Soon ({days} days)</Badge>
                    return <Badge className="bg-green-600 text-white text-base px-3 py-1">🟢 Active — Expires {formatDate(lastScan.subscription?.endDate)}</Badge>
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