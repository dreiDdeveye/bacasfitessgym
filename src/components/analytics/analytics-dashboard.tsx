"use client"

import { useEffect, useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts"
import {
  format,
  subMonths,
  startOfYear,
  endOfYear,
  eachDayOfInterval,
  startOfWeek,
  isAfter,
  subDays,
  endOfMonth,
  startOfWeek as getStartOfWeek,
  getDaysInMonth,
  endOfWeek,
} from "date-fns"
import type { ScanLog, Payment, User as UserType, Subscription } from "@/src/types"
import { storageService } from "@/src/services/storage.service"
import {
  TrendingUp, TrendingDown, Minus, Clock, Users, Calendar,
  Activity, Moon, LogIn, LogOut, Timer, UserCheck,
  PhilippinePeso, CreditCard, Banknote, Wallet, BarChart2,
} from "lucide-react"

// ─── Philippine Time helpers (UTC+8) ─────────────────────────────────────────
const PH_OFFSET_MS = 8 * 60 * 60 * 1000

function toPHDate(timestamp: string): Date {
  return new Date(new Date(timestamp).getTime() + PH_OFFSET_MS)
}
function toPHDateString(timestamp: string): string {
  const d = toPHDate(timestamp)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}
function nowPH() {
  const d = toPHDate(new Date().toISOString())
  return {
    year:  d.getUTCFullYear(),
    month: d.getUTCMonth(),
    str:   `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
  }
}
function phYear(ts: string)      { return toPHDate(ts).getUTCFullYear() }
function phMonth(ts: string)     { return toPHDate(ts).getUTCMonth() }
function phDayOfWeek(ts: string) { return toPHDate(ts).getUTCDay() }
function phHour(ts: string)      { return toPHDate(ts).getUTCHours() }
// ─────────────────────────────────────────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────────────────────
interface DaySession {
  userId: string
  userName: string
  checkInTime: string
  checkOutTime: string | null
  durationMs: number
  isActive: boolean
}
interface MonthlyData   { month: string; checkIns: number }
interface ContributionDay { date: Date; count: number; dateString: string }
interface TimePair      { label: string; start: number; end: number }
type TimeRange = "today" | "week" | "month" | "year" | "all"
type RevenueRange = "today" | "week" | "month" | "year"

// ─── Revenue-specific types ───────────────────────────────────────────────────
type PaymentMethodKey = "cash" | "gcash" | "paymaya" | "banktransfer"
type PlanKey = "1month" | "6months" | "1year" | "walkin" | "daily" | "other"

interface RevenueBarPoint { label: string; revenue: number; count: number }
interface RevenueTrendPoint { label: string; [plan: string]: number | string }
interface RevenueTransaction {
  paymentId: string
  userName: string
  userId: string
  amount: number
  paymentMethod: string
  plan: string
  paymentDate: string
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TIME_PAIRS: TimePair[] = Array.from({ length: 12 }, (_, i) => {
  const start = 1 + i * 2
  const end   = start + 1
  const fmt   = (h: number) => `${((h - 1) % 12) + 1} ${h >= 12 && h < 24 ? "PM" : "AM"}`
  return { label: `${fmt(start)} - ${fmt(end)}`, start, end }
})

const last12Months = Array.from({ length: 12 }, (_, i) => {
  const date = subMonths(new Date(), 11 - i)
  return { key: format(date, "yyyy-MM"), label: format(date, "MMM yyyy") }
})

const DAY_NAMES  = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const DAY_SHORT  = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

const colors = [
  "#4f46e5","#10b981","#f59e0b","#ef4444","#3b82f6","#ec4899",
  "#22d3ee","#f97316","#a855f7","#14b8a6","#f43f5e","#8b5cf6",
]

const CONTRIBUTION_COLORS = {
  empty: "bg-zinc-800", level1: "bg-emerald-900",
  level2: "bg-emerald-700", level3: "bg-emerald-500", level4: "bg-emerald-400",
}

const METHOD_LABELS: Record<PaymentMethodKey, string> = {
  cash: "Cash", gcash: "GCash", paymaya: "PayMaya", banktransfer: "Bank Transfer",
}
const METHOD_COLORS: Record<PaymentMethodKey, string> = {
  cash: "#10b981", gcash: "#3b82f6", paymaya: "#f59e0b", banktransfer: "#a855f7",
}
const PLAN_LABELS: Record<PlanKey, string> = {
  "1month": "1 Month", "6months": "6 Months", "1year": "1 Year",
  walkin: "Walk-in", daily: "Daily", other: "Other",
}
const PLAN_COLORS: Record<PlanKey, string> = {
  "1month": "#4f46e5", "6months": "#10b981", "1year": "#f59e0b",
  walkin: "#3b82f6", daily: "#ec4899", other: "#71717a",
}

function getPlanKey(sub: Subscription | undefined | null): PlanKey {
  if (!sub) return "other"
  const normalize = (value?: string | null) => (value || "").toLowerCase().replace(/[\s_-]+/g, "")
  const dur  = normalize(sub.planDuration)
  const type = normalize(sub.membershipType)

  if (dur === "daily") return "daily"
  if (dur === "walkin") return "walkin"
  if (dur === "1month" || dur === "1m") return "1month"
  if (dur === "6months" || dur === "6m") return "6months"
  if (dur === "12months" || dur === "12month" || dur === "1year" || dur === "1y") return "1year"
  if (type === "walkin") return "walkin"
  if (type === "daily") return "daily"

  const start = new Date(sub.startDate)
  const end = new Date(sub.endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "other"

  const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
  const monthDiff =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())

  if (end.getHours() === 0 && end.getMinutes() === 0 && durationHours <= 24) return "daily"
  if (monthDiff === 1) return "1month"
  if (monthDiff === 6) return "6months"
  if (monthDiff === 12) return "1year"
  if (durationHours > 0) return "walkin"

  return "other"
}

function formatPeso(n: number) {
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── Shared sub-components ────────────────────────────────────────────────────
function Sparkline({ data, color = "#10b981" }: { data: number[]; color?: string }) {
  if (data.length < 2) return null
  const max = Math.max(...data, 1), min = Math.min(...data, 0), range = max - min || 1
  const width = 60, height = 20
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x},${y}`
  }).join(" ")
  return (
    <svg width={width} height={height} className="opacity-70">
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  )
}

function MiniBarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="flex items-end gap-[2px] h-5">
      {data.map((d, i) => (
        <div key={i} className="w-[6px] bg-emerald-500/80 rounded-sm transition-all hover:bg-emerald-400"
          style={{ height: `${Math.max((d.value / max) * 100, d.value > 0 ? 10 : 0)}%` }}
          title={`${d.label}: ${d.value}`} />
      ))}
    </div>
  )
}

function TrendIndicator({ current, previous, suffix = "", currency = false }: {
  current: number; previous: number; suffix?: string; currency?: boolean
}) {
  const fmt = (n: number) => currency ? formatPeso(n) : String(n)
  if (previous === 0 && current === 0)
    return <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Minus className="w-3 h-3" /> No change</span>
  const diff = current - previous
  const pct  = previous > 0 ? Math.round((diff / previous) * 100) : (current > 0 ? 100 : 0)
  if (diff > 0) return <span className="text-[11px] text-emerald-500 flex items-center gap-1"><TrendingUp className="w-3 h-3" />+{pct}% {suffix}</span>
  if (diff < 0) return <span className="text-[11px] text-red-400 flex items-center gap-1"><TrendingDown className="w-3 h-3" />{pct}% {suffix}</span>
  return <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Minus className="w-3 h-3" /> No change</span>
}

// ─── Component ────────────────────────────────────────────────────────────────
export function AnalyticsDashboard() {
  // ── Attendance state ──────────────────────────────────────────────────────
  const [monthlyData, setMonthlyData]               = useState<MonthlyData[]>([])
  const [totalCheckIns, setTotalCheckIns]           = useState(0)
  const [peakHour, setPeakHour]                     = useState<number | null>(null)
  const [quietestHour, setQuietestHour]             = useState<number | null>(null)
  const [busiestDay, setBusiestDay]                 = useState<number | null>(null)
  const [lineData, setLineData]                     = useState<any[]>([])
  const [legendOpen, setLegendOpen]                 = useState(false)
  const [selectedMonth, setSelectedMonth]           = useState(last12Months[11].key)
  const [selectedWeek, setSelectedWeek]             = useState("all")
  const [allValidLogs, setAllValidLogs]             = useState<ScanLog[]>([])
  const [contributionData, setContributionData]     = useState<ContributionDay[]>([])
  const [selectedYear, setSelectedYear]             = useState(new Date().getFullYear())
  const [yearlyTotal, setYearlyTotal]               = useState(0)
  const [hoveredDay, setHoveredDay]                 = useState<ContributionDay | null>(null)
  const [timeRange, setTimeRange]                   = useState<TimeRange>("month")
  const [thisMonthCount, setThisMonthCount]         = useState(0)
  const [lastMonthCount, setLastMonthCount]         = useState(0)
  const [thisWeekCount, setThisWeekCount]           = useState(0)
  const [lastWeekCount, setLastWeekCount]           = useState(0)
  const [todayCount, setTodayCount]                 = useState(0)
  const [yesterdayCount, setYesterdayCount]         = useState(0)
  const [previousPeakHour, setPreviousPeakHour]     = useState<number | null>(null)
  const [weeklyBreakdown, setWeeklyBreakdown]       = useState<{ label: string; value: number }[]>([])
  const [last7DaysData, setLast7DaysData]           = useState<number[]>([])
  const [hourlyDistribution, setHourlyDistribution] = useState<number[]>([])
  const [todaySessions, setTodaySessions]           = useState<DaySession[]>([])
  const [filteredPeakHour, setFilteredPeakHour]     = useState<number | null>(null)
  const [filteredQuietestHour, setFilteredQuietestHour] = useState<number | null>(null)
  const [filteredBusiestDay, setFilteredBusiestDay] = useState<number | null>(null)
  const [filteredWeeklyBreakdown, setFilteredWeeklyBreakdown] = useState<{ label: string; value: number }[]>([])
  const [filteredHourlyDistribution, setFilteredHourlyDistribution] = useState<number[]>([])
  const [filteredAvgDaily, setFilteredAvgDaily]     = useState(0)

  // ── Revenue state ─────────────────────────────────────────────────────────
  const [allPayments, setAllPayments]               = useState<Payment[]>([])
  const [revenueRange, setRevenueRange]             = useState<RevenueRange>("month")
  const [revenueMethodFilter, setRevenueMethodFilter] = useState<PaymentMethodKey | "all">("all")
  const [revenuePlanFilter, setRevenuePlanFilter]   = useState<PlanKey | "all">("all")

  // Bar chart date navigation (independent of global revenueRange)
  const [barYear, setBarYear]   = useState<number>(new Date().getFullYear())
  const [barMonth, setBarMonth] = useState<number>(new Date().getMonth())   // 0-indexed
  const [barWeek, setBarWeek]   = useState<number>(0)  // 0 = all weeks, 1-6 = specific week

  // Derived revenue KPIs
  const [revToday, setRevToday]                     = useState(0)
  const [revYesterday, setRevYesterday]             = useState(0)
  const [revThisWeek, setRevThisWeek]               = useState(0)
  const [revLastWeek, setRevLastWeek]               = useState(0)
  const [revThisMonth, setRevThisMonth]             = useState(0)
  const [revLastMonth, setRevLastMonth]             = useState(0)
  const [revThisYear, setRevThisYear]               = useState(0)
  const [revLastYear, setRevLastYear]               = useState(0)

  // Chart data
  const [revenueBarData, setRevenueBarData]         = useState<RevenueBarPoint[]>([])
  const [revenueMethodPie, setRevenueMethodPie]     = useState<{ name: string; value: number; color: string }[]>([])
  const [revenuePlanPie, setRevenuePlanPie]         = useState<{ name: string; value: number; color: string }[]>([])
  const [revenueTrendData, setRevenueTrendData]     = useState<RevenueTrendPoint[]>([])
  const [userMap, setUserMap]                       = useState<Map<string, string>>(new Map())
  const [subMap, setSubMap]                         = useState<Map<string, Subscription>>(new Map())
  const [recentTransactions, setRecentTransactions] = useState<RevenueTransaction[]>([])

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => { loadAnalytics() }, [])

  useEffect(() => {
    if (allValidLogs.length) {
      updateLineDataForMonth(selectedMonth, selectedWeek)
      generateContributionData(selectedYear)
    }
  }, [allValidLogs, selectedMonth, selectedYear, selectedWeek])

  useEffect(() => {
    if (allValidLogs.length === 0) return
    computeFilteredAttendance()
  }, [timeRange, allValidLogs])

  useEffect(() => {
    if (allPayments.length === 0) return
    computeRevenue()
  }, [revenueRange, revenueMethodFilter, revenuePlanFilter, allPayments, subMap, barYear, barMonth, barWeek])

  // ── Attendance: time-range filtered ──────────────────────────────────────
  function computeFilteredAttendance() {
    const ph      = nowPH()
    const realNow = new Date()
    const todayStr = ph.str
    const thisWeekStartStr = toPHDateString(getStartOfWeek(realNow, { weekStartsOn: 0 }).toISOString())

    let filteredLogs: ScanLog[] = []
    let daysInRange = 1

    switch (timeRange) {
      case "today":
        filteredLogs = allValidLogs.filter(l => toPHDateString(l.timestamp) === todayStr)
        daysInRange = 1; break
      case "week":
        filteredLogs = allValidLogs.filter(l => toPHDateString(l.timestamp) >= thisWeekStartStr)
        daysInRange = 7; break
      case "month":
        filteredLogs = allValidLogs.filter(l => phYear(l.timestamp) === ph.year && phMonth(l.timestamp) === ph.month)
        daysInRange = getDaysInMonth(realNow); break
      case "year":
        filteredLogs = allValidLogs.filter(l => phYear(l.timestamp) === ph.year)
        daysInRange = 12; break
      default:
        filteredLogs = allValidLogs; daysInRange = 365
    }

    daysInRange = Math.max(1, daysInRange)

    const hourMap = new Map<number, number>()
    filteredLogs.forEach(l => { const h = phHour(l.timestamp); hourMap.set(h, (hourMap.get(h) || 0) + 1) })
    let maxHour: number | null = null, maxCount = 0, minHour: number | null = null, minCount = Infinity
    hourMap.forEach((count, hour) => {
      if (count > maxCount) { maxCount = count; maxHour = hour }
      if (hour >= 5 && hour <= 23 && count < minCount && count > 0) { minCount = count; minHour = hour }
    })
    setFilteredPeakHour(maxHour); setFilteredQuietestHour(minHour)
    setFilteredHourlyDistribution(Array.from({ length: 24 }, (_, i) => hourMap.get(i) || 0))

    const dayMap = new Map<number, number>()
    filteredLogs.forEach(l => { const d = phDayOfWeek(l.timestamp); dayMap.set(d, (dayMap.get(d) || 0) + 1) })
    let maxDay: number | null = null, maxDayCount = 0
    dayMap.forEach((count, day) => { if (count > maxDayCount) { maxDayCount = count; maxDay = day } })
    setFilteredBusiestDay(maxDay)
    setFilteredWeeklyBreakdown(DAY_SHORT.map((label, i) => ({ label, value: dayMap.get(i) || 0 })))
    setFilteredAvgDaily(Math.round(filteredLogs.length / daysInRange))
  }

  // ── Revenue computation ───────────────────────────────────────────────────
  function computeRevenue() {
    const ph      = nowPH()
    const realNow = new Date()
    const todayStr = ph.str
    const yesterdayStr = toPHDateString(subDays(realNow, 1).toISOString())
    const thisWeekStartStr = toPHDateString(getStartOfWeek(realNow, { weekStartsOn: 0 }).toISOString())
    const lastWeekStartStr = toPHDateString(subDays(getStartOfWeek(realNow, { weekStartsOn: 0 }), 7).toISOString())
    const lastWeekEndStr   = toPHDateString(subDays(getStartOfWeek(realNow, { weekStartsOn: 0 }), 1).toISOString())
    const lastMonthDate    = subMonths(realNow, 1)
    const lastMonthY       = toPHDate(lastMonthDate.toISOString()).getUTCFullYear()
    const lastMonthM       = toPHDate(lastMonthDate.toISOString()).getUTCMonth()

    const sum = (payments: Payment[]) => payments.reduce((s, p) => s + (p.amount || 0), 0)
    const filterMethod = (p: Payment) => revenueMethodFilter === "all" || (p.paymentMethod as string) === revenueMethodFilter
    const filterPlan   = (p: Payment) => revenuePlanFilter === "all" || getPlanKey(subMap.get(p.userId)) === revenuePlanFilter

    // KPIs (unfiltered by method/for to keep totals accurate)
    setRevToday(sum(allPayments.filter(p => p.paymentDate && toPHDateString(p.paymentDate) === todayStr)))
    setRevYesterday(sum(allPayments.filter(p => p.paymentDate && toPHDateString(p.paymentDate) === yesterdayStr)))
    setRevThisWeek(sum(allPayments.filter(p => p.paymentDate && toPHDateString(p.paymentDate) >= thisWeekStartStr)))
    setRevLastWeek(sum(allPayments.filter(p => {
      const s = p.paymentDate ? toPHDateString(p.paymentDate) : ""
      return s >= lastWeekStartStr && s <= lastWeekEndStr
    })))
    setRevThisMonth(sum(allPayments.filter(p => p.paymentDate && phYear(p.paymentDate) === ph.year && phMonth(p.paymentDate) === ph.month)))
    setRevLastMonth(sum(allPayments.filter(p => p.paymentDate && phYear(p.paymentDate) === lastMonthY && phMonth(p.paymentDate) === lastMonthM)))
    setRevThisYear(sum(allPayments.filter(p => p.paymentDate && phYear(p.paymentDate) === ph.year)))
    setRevLastYear(sum(allPayments.filter(p => p.paymentDate && phYear(p.paymentDate) === ph.year - 1)))

    // Filtered payments for charts
    const filtered = allPayments.filter(p => p.paymentDate && filterMethod(p) && filterPlan(p))

    // Bar chart data — uses barYear/barMonth/barWeek for fine-grained navigation
    let barData: RevenueBarPoint[] = []
    switch (revenueRange) {
      case "today": {
        barData = Array.from({ length: 24 }, (_, h) => ({
          label:   formatHourLabel(h),
          revenue: sum(filtered.filter(p => phHour(p.paymentDate!) === h && toPHDateString(p.paymentDate!) === todayStr)),
          count:   filtered.filter(p => phHour(p.paymentDate!) === h && toPHDateString(p.paymentDate!) === todayStr).length,
        })).filter(d => d.revenue > 0 || d.count > 0)
        break
      }
      case "week": {
        // Use barYear + week-of-year based on barWeek picker offset from start of barYear
        const weekStart = new Date(barYear, 0, 1 + barWeek * 7)
        const wsStr = `${weekStart.getFullYear()}-${String(weekStart.getMonth()+1).padStart(2,"0")}-${String(weekStart.getDate()).padStart(2,"0")}`
        const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000)
        const weStr = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth()+1).padStart(2,"0")}-${String(weekEnd.getDate()).padStart(2,"0")}`
        barData = DAY_SHORT.map((label, i) => ({
          label,
          revenue: sum(filtered.filter(p => { const s = toPHDateString(p.paymentDate!); return s >= wsStr && s <= weStr && phDayOfWeek(p.paymentDate!) === i })),
          count:   filtered.filter(p => { const s = toPHDateString(p.paymentDate!); return s >= wsStr && s <= weStr && phDayOfWeek(p.paymentDate!) === i }).length,
        }))
        break
      }
      case "month": {
        // Use barYear + barMonth; if barWeek > 0, filter to that week within the month
        const daysInBarMonth = new Date(barYear, barMonth + 1, 0).getDate()
        const allDays = Array.from({ length: daysInBarMonth }, (_, i) => {
          const dayStr = `${barYear}-${String(barMonth + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`
          return { label: String(i + 1), dayStr }
        })
        const filteredDays = barWeek === 0 ? allDays : (() => {
          // Week 1 = days 1-7, Week 2 = 8-14, etc.
          const start = (barWeek - 1) * 7
          return allDays.slice(start, start + 7)
        })()
        barData = filteredDays.map(({ label, dayStr }) => ({
          label,
          revenue: sum(filtered.filter(p => toPHDateString(p.paymentDate!) === dayStr)),
          count:   filtered.filter(p => toPHDateString(p.paymentDate!) === dayStr).length,
        }))
        break
      }
      case "year": {
        // Use barYear
        barData = MONTH_SHORT.map((label, mi) => ({
          label,
          revenue: sum(filtered.filter(p => phYear(p.paymentDate!) === barYear && phMonth(p.paymentDate!) === mi)),
          count:   filtered.filter(p => phYear(p.paymentDate!) === barYear && phMonth(p.paymentDate!) === mi).length,
        }))
        break
      }
    }
    setRevenueBarData(barData)

    // Method breakdown pie
    const methodTotals = new Map<string, number>()
    filtered.forEach(p => {
      const k = p.paymentMethod || "unknown"
      methodTotals.set(k, (methodTotals.get(k) || 0) + (p.amount || 0))
    })
    setRevenueMethodPie(
      Array.from(methodTotals.entries()).map(([k, v]) => ({
        name:  METHOD_LABELS[k as PaymentMethodKey] ?? k,
        value: v,
        color: METHOD_COLORS[k as PaymentMethodKey] ?? "#71717a",
      }))
    )

    // Plan breakdown pie
    const planTotals = new Map<PlanKey, number>()
    filtered.forEach(p => {
      const k = getPlanKey(subMap.get(p.userId))
      planTotals.set(k, (planTotals.get(k) || 0) + (p.amount || 0))
    })
    setRevenuePlanPie(
      Array.from(planTotals.entries())
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({ name: PLAN_LABELS[k], value: v, color: PLAN_COLORS[k] }))
    )

    // Revenue trend by plan
    const PLAN_KEYS: PlanKey[] = ["1month","6months","1year","walkin","daily","other"]
    let trendData: RevenueTrendPoint[] = []
    const planSum = (pk: PlanKey, bucket: Payment[]) =>
      bucket.filter(p => getPlanKey(subMap.get(p.userId)) === pk).reduce((s,p) => s+(p.amount||0), 0)
    switch (revenueRange) {
      case "today": {
        const labels = Array.from({ length: 24 }, (_, h) => formatHourLabel(h))
        trendData = labels.map((label, h) => {
          const bucket = filtered.filter(p => phHour(p.paymentDate!) === h && toPHDateString(p.paymentDate!) === todayStr)
          const obj: RevenueTrendPoint = { label }
          PLAN_KEYS.forEach(pk => { obj[PLAN_LABELS[pk]] = planSum(pk, bucket) })
          return obj
        }).filter(d => PLAN_KEYS.some(pk => (d[PLAN_LABELS[pk]] as number) > 0))
        break
      }
      case "week": {
        trendData = DAY_SHORT.map((label, i) => {
          const bucket = filtered.filter(p => toPHDateString(p.paymentDate!) >= thisWeekStartStr && phDayOfWeek(p.paymentDate!) === i)
          const obj: RevenueTrendPoint = { label }
          PLAN_KEYS.forEach(pk => { obj[PLAN_LABELS[pk]] = planSum(pk, bucket) })
          return obj
        })
        break
      }
      case "month": {
        const daysInBarMonth2 = new Date(barYear, barMonth + 1, 0).getDate()
        const allDays2 = Array.from({ length: daysInBarMonth2 }, (_, i) => ({
          label: String(i+1),
          dayStr: `${barYear}-${String(barMonth+1).padStart(2,"0")}-${String(i+1).padStart(2,"0")}`
        }))
        const days2 = barWeek === 0 ? allDays2 : allDays2.slice((barWeek-1)*7, (barWeek-1)*7+7)
        trendData = days2.map(({ label, dayStr }) => {
          const bucket = filtered.filter(p => toPHDateString(p.paymentDate!) === dayStr)
          const obj: RevenueTrendPoint = { label }
          PLAN_KEYS.forEach(pk => { obj[PLAN_LABELS[pk]] = planSum(pk, bucket) })
          return obj
        })
        break
      }
      case "year": {
        trendData = MONTH_SHORT.map((label, mi) => {
          const bucket = filtered.filter(p => phYear(p.paymentDate!) === barYear && phMonth(p.paymentDate!) === mi)
          const obj: RevenueTrendPoint = { label }
          PLAN_KEYS.forEach(pk => { obj[PLAN_LABELS[pk]] = planSum(pk, bucket) })
          return obj
        })
        break
      }
    }
    setRevenueTrendData(trendData)

    // Recent transactions (latest 20, respecting range + filters)
    let rangeFiltered = filtered
    switch (revenueRange) {
      case "today": rangeFiltered = filtered.filter(p => toPHDateString(p.paymentDate!) === todayStr); break
      case "week":  rangeFiltered = filtered.filter(p => toPHDateString(p.paymentDate!) >= thisWeekStartStr); break
      case "month": rangeFiltered = filtered.filter(p => phYear(p.paymentDate!) === ph.year && phMonth(p.paymentDate!) === ph.month); break
      case "year":  rangeFiltered = filtered.filter(p => phYear(p.paymentDate!) === ph.year); break
    }
    const sorted = [...rangeFiltered].sort((a, b) => new Date(b.paymentDate!).getTime() - new Date(a.paymentDate!).getTime())
    setRecentTransactions(
      sorted.slice(0, 20).map(p => ({
        paymentId:     p.paymentId,
        userName:      userMap.get(p.userId) || "",
        userId:        p.userId,
        amount:        p.amount,
        paymentMethod: METHOD_LABELS[p.paymentMethod as PaymentMethodKey] ?? p.paymentMethod,
        plan:          PLAN_LABELS[getPlanKey(subMap.get(p.userId))],
        paymentDate:   p.paymentDate!,
      }))
    )
  }

  // ── Main loader ───────────────────────────────────────────────────────────
  async function loadAnalytics() {
    const [logs, payments, users, subs] = await Promise.all([
      storageService.getScanLogs(),
      storageService.getPayments(),
      storageService.getUsers(),
      storageService.getSubscriptions(),
    ])
    const newUserMap = new Map(users.map((u: UserType) => [u.userId, u.name]))
    const newSubMap  = new Map(subs.map((s: Subscription) => [s.userId, s]))
    setUserMap(newUserMap)
    setSubMap(newSubMap)

    const validLogs = logs.filter(l => l.action === "check-in" && l.status === "success")
    setAllValidLogs(validLogs)
    setTotalCheckIns(validLogs.length)
    setAllPayments(payments)

    const ph      = nowPH()
    const realNow = new Date()
    const todayStr     = ph.str
    const yesterdayStr = toPHDateString(subDays(realNow, 1).toISOString())
    const thisWeekStartStr = toPHDateString(getStartOfWeek(realNow, { weekStartsOn: 0 }).toISOString())
    const lastWeekStartStr = toPHDateString(subDays(getStartOfWeek(realNow, { weekStartsOn: 0 }), 7).toISOString())
    const lastWeekEndStr   = toPHDateString(subDays(getStartOfWeek(realNow, { weekStartsOn: 0 }), 1).toISOString())
    const lastMonthDate    = subMonths(realNow, 1)
    const lastMonthY       = toPHDate(lastMonthDate.toISOString()).getUTCFullYear()
    const lastMonthM       = toPHDate(lastMonthDate.toISOString()).getUTCMonth()

    setTodayCount(validLogs.filter(l => toPHDateString(l.timestamp) === todayStr).length)
    setYesterdayCount(validLogs.filter(l => toPHDateString(l.timestamp) === yesterdayStr).length)

    const thisMonthLogs = validLogs.filter(l => phYear(l.timestamp) === ph.year && phMonth(l.timestamp) === ph.month)
    const lastMonthLogs = validLogs.filter(l => phYear(l.timestamp) === lastMonthY && phMonth(l.timestamp) === lastMonthM)
    setThisMonthCount(thisMonthLogs.length)
    setLastMonthCount(lastMonthLogs.length)
    setThisWeekCount(validLogs.filter(l => toPHDateString(l.timestamp) >= thisWeekStartStr).length)
    setLastWeekCount(validLogs.filter(l => {
      const s = toPHDateString(l.timestamp)
      return s >= lastWeekStartStr && s <= lastWeekEndStr
    }).length)

    const hourMap = new Map<number, number>()
    validLogs.forEach(l => { const h = phHour(l.timestamp); hourMap.set(h, (hourMap.get(h) || 0) + 1) })
    let maxHour: number | null = null, maxCount = 0, minHour: number | null = null, minCount = Infinity
    hourMap.forEach((count, hour) => {
      if (count > maxCount) { maxCount = count; maxHour = hour }
      if (hour >= 5 && hour <= 23 && count < minCount && count > 0) { minCount = count; minHour = hour }
    })
    setPeakHour(maxHour); setQuietestHour(minHour)
    setHourlyDistribution(Array.from({ length: 24 }, (_, i) => hourMap.get(i) || 0))

    const pmHourMap = new Map<number, number>()
    lastMonthLogs.forEach(l => { const h = phHour(l.timestamp); pmHourMap.set(h, (pmHourMap.get(h) || 0) + 1) })
    let prevMaxHour: number | null = null, prevMaxCount = 0
    pmHourMap.forEach((count, hour) => { if (count > prevMaxCount) { prevMaxCount = count; prevMaxHour = hour } })
    setPreviousPeakHour(prevMaxHour)

    const dayMap = new Map<number, number>()
    validLogs.forEach(l => { const d = phDayOfWeek(l.timestamp); dayMap.set(d, (dayMap.get(d) || 0) + 1) })
    let maxDay: number | null = null, maxDayCount = 0
    dayMap.forEach((count, day) => { if (count > maxDayCount) { maxDayCount = count; maxDay = day } })
    setBusiestDay(maxDay)
    setWeeklyBreakdown(DAY_SHORT.map((label, i) => ({ label, value: dayMap.get(i) || 0 })))

    const last7: number[] = []
    for (let i = 6; i >= 0; i--) {
      const s = toPHDateString(subDays(realNow, i).toISOString())
      last7.push(validLogs.filter(l => toPHDateString(l.timestamp) === s).length)
    }
    setLast7DaysData(last7)

    const monthly: MonthlyData[] = []
    for (let i = 11; i >= 0; i--) {
      const monthDate = subMonths(realNow, i)
      const y = toPHDate(monthDate.toISOString()).getUTCFullYear()
      const m = toPHDate(monthDate.toISOString()).getUTCMonth()
      monthly.push({
        month: format(monthDate, "MMM"),
        checkIns: validLogs.filter(l => phYear(l.timestamp) === y && phMonth(l.timestamp) === m).length,
      })
    }
    setMonthlyData(monthly)
    buildTodaySessions(logs, todayStr)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function buildTodaySessions(allLogs: ScanLog[], todayStr: string) {
    const todayLogs = allLogs
      .filter(l => l.status === "success" && (l.action === "check-in" || l.action === "check-out") && toPHDateString(l.timestamp) === todayStr)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    const sessions: DaySession[] = []
    const checkInMap = new Map<string, ScanLog>()

    for (const log of todayLogs) {
      if (log.action === "check-in") {
        if (checkInMap.has(log.userId)) {
          const prev = checkInMap.get(log.userId)!
          sessions.push({ userId: prev.userId, userName: prev.userName, checkInTime: prev.timestamp, checkOutTime: null, durationMs: Date.now() - new Date(prev.timestamp).getTime(), isActive: true })
        }
        checkInMap.set(log.userId, log)
      } else if (log.action === "check-out") {
        const checkIn = checkInMap.get(log.userId)
        if (checkIn) {
          sessions.push({ userId: checkIn.userId, userName: checkIn.userName, checkInTime: checkIn.timestamp, checkOutTime: log.timestamp, durationMs: new Date(log.timestamp).getTime() - new Date(checkIn.timestamp).getTime(), isActive: false })
          checkInMap.delete(log.userId)
        }
      }
    }
    for (const [, log] of checkInMap) {
      sessions.push({ userId: log.userId, userName: log.userName, checkInTime: log.timestamp, checkOutTime: null, durationMs: Date.now() - new Date(log.timestamp).getTime(), isActive: true })
    }
    sessions.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
      return new Date(b.checkInTime).getTime() - new Date(a.checkInTime).getTime()
    })
    setTodaySessions(sessions)
  }

  function generateContributionData(year: number) {
    const yearStart = startOfYear(new Date(year, 0, 1))
    const yearEnd   = endOfYear(new Date(year, 0, 1))
    const allDays   = eachDayOfInterval({ start: yearStart, end: yearEnd })
    const dayCountMap = new Map<string, number>()
    allValidLogs.forEach(log => {
      const k = toPHDateString(log.timestamp)
      if (k.startsWith(String(year))) dayCountMap.set(k, (dayCountMap.get(k) || 0) + 1)
    })
    setContributionData(allDays.map(date => {
      const dateString = format(date, "yyyy-MM-dd")
      return { date, count: dayCountMap.get(dateString) || 0, dateString }
    }))
    setYearlyTotal(Array.from(dayCountMap.values()).reduce((s, c) => s + c, 0))
  }

  function updateLineDataForMonth(monthKey: string, weekFilter: string) {
    let filteredLogs = allValidLogs.filter(log => {
      const y = phYear(log.timestamp), m = phMonth(log.timestamp) + 1
      return `${y}-${String(m).padStart(2, "0")}` === monthKey
    })
    if (weekFilter !== "all") {
      const weekNumber = parseInt(weekFilter.replace("week", ""))
      const [year, month] = monthKey.split("-").map(Number)
      const monthStart = new Date(year, month - 1, 1)
      const monthEnd   = endOfMonth(monthStart)
      let currentWeek = 1, currentDate = monthStart
      while (currentWeek < weekNumber && currentDate <= monthEnd) {
        currentDate = new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000)
        currentWeek++
      }
      const weekStart = new Date(Math.max(startOfWeek(currentDate, { weekStartsOn: 0 }).getTime(), monthStart.getTime()))
      const weekEnd   = new Date(Math.min(endOfWeek(currentDate, { weekStartsOn: 0 }).getTime(), monthEnd.getTime()))
      const wsStr = format(weekStart, "yyyy-MM-dd"), weStr = format(weekEnd, "yyyy-MM-dd")
      filteredLogs = filteredLogs.filter(log => { const s = toPHDateString(log.timestamp); return s >= wsStr && s <= weStr })
    }
    const data: any[] = []
    for (let day = 0; day < 7; day++) {
      const obj: any = { day: DAY_SHORT[day] }
      TIME_PAIRS.forEach(({ label, start, end }) => {
        obj[label] = filteredLogs.filter(log => {
          const h = phHour(log.timestamp), nh = h === 0 ? 24 : h
          return phDayOfWeek(log.timestamp) === day && (nh === start || nh === end)
        }).length
      })
      data.push(obj)
    }
    setLineData(data)
  }

  function getContributionColor(count: number, maxCount: number) {
    if (count === 0) return CONTRIBUTION_COLORS.empty
    const r = count / maxCount
    if (r <= 0.25) return CONTRIBUTION_COLORS.level1
    if (r <= 0.5)  return CONTRIBUTION_COLORS.level2
    if (r <= 0.75) return CONTRIBUTION_COLORS.level3
    return CONTRIBUTION_COLORS.level4
  }

  function getWeeksData() {
    if (!contributionData.length) return []
    const weeks: ContributionDay[][] = []
    let currentWeek: ContributionDay[] = []
    const yearStart   = new Date(selectedYear, 0, 1)
    const firstSunday = startOfWeek(yearStart, { weekStartsOn: 0 })
    if (firstSunday < yearStart) {
      eachDayOfInterval({ start: firstSunday, end: new Date(selectedYear, 0, 0) }).forEach(date => {
        currentWeek.push({ date, count: -1, dateString: format(date, "yyyy-MM-dd") })
      })
    }
    contributionData.forEach(day => {
      currentWeek.push(day)
      if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = [] }
    })
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push({ date: new Date(), count: -1, dateString: "" })
      weeks.push(currentWeek)
    }
    return weeks
  }

  function getMonthLabels() {
    const months: { label: string; weekIndex: number }[] = []
    let currentMonth = -1
    getWeeksData().forEach((week, weekIndex) => {
      const firstValid = week.find(d => d.count >= 0)
      if (firstValid) {
        const month = firstValid.date.getMonth()
        if (month !== currentMonth) { currentMonth = month; months.push({ label: format(firstValid.date, "MMM"), weekIndex }) }
      }
    })
    return months
  }

  function getAvailableWeeks() {
    const [year, month] = selectedMonth.split("-").map(Number)
    const monthStart = new Date(year, month - 1, 1)
    const monthEnd   = endOfMonth(monthStart)
    const weeks: { value: string; label: string }[] = [{ value: "all", label: "All Weeks" }]
    let currentWeek = 1, currentDate = monthStart
    while (currentDate <= monthEnd) {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 })
      const weekEnd   = endOfWeek(currentDate, { weekStartsOn: 0 })
      if (weekStart.getMonth() === month - 1 || currentDate.getMonth() === month - 1) {
        weeks.push({
          value: `week${currentWeek}`,
          label: `Week ${currentWeek} (${format(Math.max(weekStart.getTime(), monthStart.getTime()), "MMM d")} - ${format(Math.min(weekEnd.getTime(), monthEnd.getTime()), "MMM d")})`
        })
      }
      currentWeek++
      currentDate = new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000)
    }
    return weeks
  }

  function formatHourLabel(hour24: number) {
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
    return `${hour12} ${hour24 < 12 ? "AM" : "PM"}`
  }

  const weeks        = getWeeksData()
  const monthLabels  = getMonthLabels()
  const maxDayCount  = Math.max(...contributionData.map(d => d.count), 1)
  const currentYear  = new Date().getFullYear()
  const yearOptions  = Array.from({ length: 5 }, (_, i) => currentYear - i)
  const availableWeeks = getAvailableWeeks()

  const getDisplayCount   = () => ({ today: todayCount, week: thisWeekCount, month: thisMonthCount, year: yearlyTotal, all: totalCheckIns }[timeRange])
  const getPreviousCount  = () => ({ today: yesterdayCount, week: lastWeekCount, month: lastMonthCount, year: 0, all: 0 }[timeRange])
  const getComparisonLabel = () => ({ today: "vs yesterday", week: "vs last week", month: "vs last month", year: "", all: "" }[timeRange])

  // Revenue KPI helpers
  const revCurrent  = { today: revToday, week: revThisWeek, month: revThisMonth, year: revThisYear }[revenueRange]
  const revPrevious = { today: revYesterday, week: revLastWeek, month: revLastMonth, year: revLastYear }[revenueRange]
  const revLabel    = { today: "vs yesterday", week: "vs last week", month: "vs last month", year: "vs last year" }[revenueRange]

  const totalRevenueInRange = revenueBarData.reduce((s, d) => s + d.revenue, 0)
  const totalTransactionsInRange = revenueBarData.reduce((s, d) => s + d.count, 0)
  const avgTransaction = totalTransactionsInRange > 0 ? totalRevenueInRange / totalTransactionsInRange : 0

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Attendance Time Range Selector ────────────────────────────────── */}
      <div className="flex items-center gap-2 md:gap-3 flex-wrap">
        <span className="text-xs md:text-sm text-muted-foreground">View:</span>
        <div className="flex gap-0.5 md:gap-1 bg-zinc-800/50 rounded-lg p-1 overflow-x-auto">
          {(["today","week","month","year","all"] as TimeRange[]).map(range => (
            <button key={range} onClick={() => setTimeRange(range)}
              className={`px-2 md:px-3 py-1 md:py-1.5 text-xs md:text-sm rounded-md transition-all whitespace-nowrap ${timeRange === range ? "bg-emerald-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-zinc-700/50"}`}>
              {range.charAt(0).toUpperCase() + range.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Attendance Primary Stats ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
        <Card className="bg-zinc-900/30 border-zinc-800">
          <CardHeader className="pb-2 p-3 md:p-6 md:pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="flex items-center gap-1.5 text-[10px] md:text-xs"><Users className="w-3 h-3 md:w-3.5 md:h-3.5" />Check-ins</CardDescription>
              <span className="hidden sm:block"><Sparkline data={last7DaysData} /></span>
            </div>
            <CardTitle className="text-2xl md:text-3xl font-bold tracking-tight">{getDisplayCount()}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-3 md:px-6 pb-3 md:pb-6">
            {timeRange !== "year" && timeRange !== "all" && (
              <TrendIndicator current={getDisplayCount()} previous={getPreviousCount()} suffix={getComparisonLabel()} />
            )}
            <p className="text-[9px] md:text-[10px] text-muted-foreground mt-1 md:mt-1.5 leading-tight">
              All recorded entries for {timeRange === "all" ? "all time" : `this ${timeRange}`}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/30 border-zinc-800">
          <CardHeader className="pb-2 p-3 md:p-6 md:pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="flex items-center gap-1.5 text-[10px] md:text-xs"><Clock className="w-3 h-3 md:w-3.5 md:h-3.5" />Peak Hour</CardDescription>
              <span className="hidden sm:block"><Sparkline data={filteredHourlyDistribution.length ? filteredHourlyDistribution : hourlyDistribution} color="#f59e0b" /></span>
            </div>
            <CardTitle className="text-2xl md:text-3xl font-bold tracking-tight">
              {filteredPeakHour !== null ? formatHourLabel(filteredPeakHour) : peakHour !== null ? formatHourLabel(peakHour) : "N/A"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-3 md:px-6 pb-3 md:pb-6">
            <span className="hidden md:flex text-[11px] text-muted-foreground items-center gap-1">
              {previousPeakHour !== null && filteredPeakHour !== null && filteredPeakHour !== previousPeakHour
                ? <><Activity className="w-3 h-3 text-amber-500" />Different from last month</>
                : <><Minus className="w-3 h-3" /> Consistent</>}
            </span>
            <p className="text-[9px] md:text-[10px] text-muted-foreground mt-1 md:mt-1.5 leading-tight">Most active time ({timeRange})</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/30 border-zinc-800">
          <CardHeader className="pb-2 p-3 md:p-6 md:pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="flex items-center gap-1.5 text-[10px] md:text-xs"><Calendar className="w-3 h-3 md:w-3.5 md:h-3.5" />Busiest Day</CardDescription>
              <span className="hidden sm:block"><MiniBarChart data={filteredWeeklyBreakdown.length ? filteredWeeklyBreakdown : weeklyBreakdown} /></span>
            </div>
            <CardTitle className="text-2xl md:text-3xl font-bold tracking-tight">
              {filteredBusiestDay !== null ? DAY_SHORT[filteredBusiestDay] : busiestDay !== null ? DAY_SHORT[busiestDay] : "N/A"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-3 md:px-6 pb-3 md:pb-6">
            <span className="text-[11px] text-emerald-500">
              {filteredBusiestDay !== null ? DAY_NAMES[filteredBusiestDay] : busiestDay !== null ? DAY_NAMES[busiestDay] : ""}
            </span>
            <p className="text-[9px] md:text-[10px] text-muted-foreground mt-1 md:mt-1.5 leading-tight">Highest traffic day ({timeRange})</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/30 border-zinc-800">
          <CardHeader className="pb-2 p-3 md:p-6 md:pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="flex items-center gap-1.5 text-[10px] md:text-xs"><Moon className="w-3 h-3 md:w-3.5 md:h-3.5" />Quietest Hour</CardDescription>
            </div>
            <CardTitle className="text-2xl md:text-3xl font-bold tracking-tight">
              {filteredQuietestHour !== null ? formatHourLabel(filteredQuietestHour) : quietestHour !== null ? formatHourLabel(quietestHour) : "N/A"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-3 md:px-6 pb-3 md:pb-6">
            <span className="text-[11px] text-blue-400">Best for maintenance</span>
            <p className="text-[9px] md:text-[10px] text-muted-foreground mt-1 md:mt-1.5 leading-tight">Lowest traffic hour ({timeRange})</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Attendance Secondary Stats ────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-4">
        <Card className="bg-zinc-900/20 border-zinc-800/50">
          <CardHeader className="py-3 px-3 md:px-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="p-1.5 md:p-2 rounded-lg bg-emerald-500/10"><Calendar className="w-3.5 h-3.5 md:w-4 md:h-4 text-emerald-500" /></div>
                <div><CardDescription className="text-[10px] md:text-xs">This Month</CardDescription><CardTitle className="text-xl md:text-2xl font-bold">{thisMonthCount}</CardTitle></div>
              </div>
              <TrendIndicator current={thisMonthCount} previous={lastMonthCount} suffix="vs last month" />
            </div>
          </CardHeader>
        </Card>
        <Card className="bg-zinc-900/20 border-zinc-800/50">
          <CardHeader className="py-3 px-3 md:px-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="p-1.5 md:p-2 rounded-lg bg-blue-500/10"><Activity className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-500" /></div>
                <div>
                  <CardDescription className="text-[10px] md:text-xs">{timeRange === "year" ? "Monthly Avg" : "Daily Avg"}</CardDescription>
                  <CardTitle className="text-xl md:text-2xl font-bold">{filteredAvgDaily}</CardTitle>
                </div>
              </div>
              <span className="text-[10px] md:text-[11px] text-muted-foreground px-1.5 md:px-2 py-0.5 md:py-1 bg-zinc-800 rounded hidden sm:inline">
                {timeRange === "all" ? "Per year" : timeRange === "year" ? "This year" : `This ${timeRange}`}
              </span>
            </div>
          </CardHeader>
        </Card>
        <Card className="bg-zinc-900/20 border-zinc-800/50">
          <CardHeader className="py-3 px-3 md:px-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="p-1.5 md:p-2 rounded-lg bg-amber-500/10"><Clock className="w-3.5 h-3.5 md:w-4 md:h-4 text-amber-500" /></div>
                <div><CardDescription className="text-[10px] md:text-xs">Today</CardDescription><CardTitle className="text-xl md:text-2xl font-bold">{todayCount}</CardTitle></div>
              </div>
              <TrendIndicator current={todayCount} previous={yesterdayCount} suffix="vs yesterday" />
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* ── Today's Sessions ──────────────────────────────────────────────── */}
      <Card className="border-zinc-800">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 md:p-6">
          <div>
            <CardTitle className="text-base md:text-lg flex items-center gap-2">
              <UserCheck className="w-4 h-4 md:w-5 md:h-5 text-emerald-500" />Today&apos;s Sessions
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              {todaySessions.length} session{todaySessions.length !== 1 ? "s" : ""} today
              {todaySessions.filter(s => s.isActive).length > 0 && (
                <span className="ml-2 text-emerald-500">({todaySessions.filter(s => s.isActive).length} active now)</span>
              )}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-3 md:p-6 pt-0 md:pt-0">
          {todaySessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No sessions recorded today</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
              {todaySessions.map((session, i) => (
                <div key={`${session.userId}-${i}`}
                  className={`flex items-center gap-3 p-2.5 md:p-3 rounded-lg border transition-colors ${session.isActive ? "border-emerald-500/30 bg-emerald-500/5" : "border-zinc-800 bg-zinc-900/30"}`}>
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${session.isActive ? "bg-emerald-500 animate-pulse" : "bg-zinc-600"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{session.userName}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{session.userId}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <LogIn className="w-3 h-3 text-emerald-500" />
                        {new Date(new Date(session.checkInTime).getTime() + PH_OFFSET_MS).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "UTC" })}
                      </span>
                      {session.checkOutTime ? (
                        <span className="flex items-center gap-1">
                          <LogOut className="w-3 h-3 text-red-400" />
                          {new Date(new Date(session.checkOutTime).getTime() + PH_OFFSET_MS).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "UTC" })}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-emerald-500"><Activity className="w-3 h-3" />In progress</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Timer className="w-3 h-3 text-muted-foreground" />
                    <span className={`text-xs font-medium ${session.isActive ? "text-emerald-400" : "text-muted-foreground"}`}>
                      {(() => { const mins = Math.floor(session.durationMs / 60000), hrs = Math.floor(mins / 60); return hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m` })()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── REVENUE ANALYTICS ────────────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}

      <div className="flex items-center gap-3 pt-2">
        <BarChart2 className="w-5 h-5 text-emerald-500" />
        <h2 className="text-lg font-bold">Revenue Analytics</h2>
      </div>

      {/* Revenue range + filters */}
      <div className="flex flex-wrap gap-2 md:gap-3 items-center">
        {/* Range */}
        <div className="flex gap-0.5 md:gap-1 bg-zinc-800/50 rounded-lg p-1">
          {(["today","week","month","year"] as RevenueRange[]).map(r => (
            <button key={r} onClick={() => setRevenueRange(r)}
              className={`px-2 md:px-3 py-1 md:py-1.5 text-xs md:text-sm rounded-md transition-all whitespace-nowrap ${revenueRange === r ? "bg-emerald-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-zinc-700/50"}`}>
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>

        {/* Method filter */}
        <select value={revenueMethodFilter} onChange={e => setRevenueMethodFilter(e.target.value as any)}
          className="border border-zinc-700 rounded px-2 py-1 bg-zinc-800 text-xs md:text-sm">
          <option value="all">All Methods</option>
          {(Object.entries(METHOD_LABELS) as [PaymentMethodKey, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {/* Plan filter */}
        <select value={revenuePlanFilter} onChange={e => setRevenuePlanFilter(e.target.value as any)}
          className="border border-zinc-700 rounded px-2 py-1 bg-zinc-800 text-xs md:text-sm">
          <option value="all">All Plans</option>
          {(Object.entries(PLAN_LABELS) as [PlanKey, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Revenue KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
        <Card className="bg-zinc-900/30 border-zinc-800 border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2 p-3 md:p-6 md:pb-2">
            <CardDescription className="flex items-center gap-1.5 text-[10px] md:text-xs">
              <PhilippinePeso className="w-3 h-3 md:w-3.5 md:h-3.5" />Total Revenue
            </CardDescription>
            <CardTitle className="text-xl md:text-2xl font-bold tracking-tight text-emerald-400">
              {formatPeso(revCurrent)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-3 md:px-6 pb-3 md:pb-6">
            <TrendIndicator current={revCurrent} previous={revPrevious} suffix={revLabel} currency />
            <p className="text-[9px] md:text-[10px] text-muted-foreground mt-1 leading-tight">
              This {revenueRange}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/30 border-zinc-800">
          <CardHeader className="pb-2 p-3 md:p-6 md:pb-2">
            <CardDescription className="flex items-center gap-1.5 text-[10px] md:text-xs">
              <CreditCard className="w-3 h-3 md:w-3.5 md:h-3.5" />Transactions
            </CardDescription>
            <CardTitle className="text-xl md:text-2xl font-bold tracking-tight">
              {totalTransactionsInRange}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-3 md:px-6 pb-3 md:pb-6">
            <p className="text-[9px] md:text-[10px] text-muted-foreground mt-1 leading-tight">
              Payments this {revenueRange}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/30 border-zinc-800">
          <CardHeader className="pb-2 p-3 md:p-6 md:pb-2">
            <CardDescription className="flex items-center gap-1.5 text-[10px] md:text-xs">
              <Banknote className="w-3 h-3 md:w-3.5 md:h-3.5" />Avg per Transaction
            </CardDescription>
            <CardTitle className="text-xl md:text-2xl font-bold tracking-tight">
              {formatPeso(avgTransaction)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-3 md:px-6 pb-3 md:pb-6">
            <p className="text-[9px] md:text-[10px] text-muted-foreground mt-1 leading-tight">
              Average per payment
            </p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/30 border-zinc-800">
          <CardHeader className="pb-2 p-3 md:p-6 md:pb-2">
            <CardDescription className="flex items-center gap-1.5 text-[10px] md:text-xs">
              <Wallet className="w-3 h-3 md:w-3.5 md:h-3.5" />This Month
            </CardDescription>
            <CardTitle className="text-xl md:text-2xl font-bold tracking-tight">
              {formatPeso(revThisMonth)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-3 md:px-6 pb-3 md:pb-6">
            <TrendIndicator current={revThisMonth} previous={revLastMonth} suffix="vs last month" currency />
          </CardContent>
        </Card>
      </div>

      {/* Revenue bar chart */}
      <Card className="border-zinc-800">
        <CardHeader className="p-3 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base md:text-lg flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-emerald-500" />
                Revenue — {revenueRange.charAt(0).toUpperCase() + revenueRange.slice(1)}
              </CardTitle>
              <CardDescription className="text-xs md:text-sm mt-1">
                {formatPeso(totalRevenueInRange)} total · {totalTransactionsInRange} transactions
                {revenueMethodFilter !== "all" && ` · ${METHOD_LABELS[revenueMethodFilter]}`}
                {revenuePlanFilter !== "all" && ` · ${PLAN_LABELS[revenuePlanFilter]}`}
              </CardDescription>
            </div>

            {/* Date navigation pickers — shown per range */}
            <div className="flex flex-wrap gap-2 items-center">
              {/* Year picker — shown for year, month, week */}
              {(revenueRange === "year" || revenueRange === "month" || revenueRange === "week") && (
                <select value={barYear} onChange={e => { setBarYear(Number(e.target.value)); setBarWeek(0) }}
                  className="border border-zinc-700 rounded px-2 py-1 bg-zinc-800 text-xs">
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              )}

              {/* Month picker — shown for month range */}
              {revenueRange === "month" && (
                <select value={barMonth} onChange={e => { setBarMonth(Number(e.target.value)); setBarWeek(0) }}
                  className="border border-zinc-700 rounded px-2 py-1 bg-zinc-800 text-xs">
                  {MONTH_SHORT.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
              )}

              {/* Week picker — shown for month and week ranges */}
              {revenueRange === "month" && (
                <select value={barWeek} onChange={e => setBarWeek(Number(e.target.value))}
                  className="border border-zinc-700 rounded px-2 py-1 bg-zinc-800 text-xs">
                  <option value={0}>All Weeks</option>
                  {Array.from({ length: Math.ceil(new Date(barYear, barMonth + 1, 0).getDate() / 7) }, (_, i) => {
                    const start = i * 7 + 1
                    const end   = Math.min(start + 6, new Date(barYear, barMonth + 1, 0).getDate())
                    return <option key={i+1} value={i+1}>Week {i+1} (Day {start}–{end})</option>
                  })}
                </select>
              )}

              {/* Week-of-year picker — shown for week range */}
              {revenueRange === "week" && (
                <select value={barWeek} onChange={e => setBarWeek(Number(e.target.value))}
                  className="border border-zinc-700 rounded px-2 py-1 bg-zinc-800 text-xs min-w-[150px]">
                  {Array.from({ length: 52 }, (_, i) => {
                    const d = new Date(barYear, 0, 1 + i * 7)
                    const end = new Date(d.getTime() + 6 * 24 * 60 * 60 * 1000)
                    const fmt = (dt: Date) => `${MONTH_SHORT[dt.getMonth()]} ${dt.getDate()}`
                    return <option key={i} value={i}>Week {i+1} ({fmt(d)} – {fmt(end)})</option>
                  })}
                </select>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="h-[260px] md:h-[320px] p-2 md:p-6 md:pt-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={revenueBarData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="label" stroke="#71717a" tick={{ fontSize: 10 }} />
              <YAxis stroke="#71717a" tick={{ fontSize: 10 }} width={50}
                tickFormatter={v => v >= 1000 ? `₱${(v / 1000).toFixed(1)}k` : `₱${v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: "#18181b", borderRadius: 8, border: "1px solid #27272a", fontSize: 12 }}
                formatter={(value: number, name: string) => [
                  name === "revenue" ? formatPeso(value) : value,
                  name === "revenue" ? "Revenue" : "Transactions"
                ]}
              />
              <Bar dataKey="revenue" fill="#10b981" radius={[3, 3, 0, 0]} name="revenue">
                {revenueBarData.map((_, i) => (
                  <Cell key={i} fill={`hsl(${152 - (i % 5) * 8}, 70%, ${40 + (i % 3) * 5}%)`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Pie charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* By Payment Method */}
        <Card className="border-zinc-800">
          <CardHeader className="p-3 md:p-6">
            <CardTitle className="text-base md:text-lg flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-400" />By Payment Method
            </CardTitle>
            <CardDescription className="text-xs">Revenue breakdown by how members paid</CardDescription>
          </CardHeader>
          <CardContent className="p-2 md:p-6 md:pt-0">
            {revenueMethodPie.length === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">No data</div>
            ) : (
              <div className="flex flex-col md:flex-row items-center gap-4">
                <ResponsiveContainer width={200} height={200}>
                  <PieChart>
                    <Pie data={revenueMethodPie} cx="50%" cy="50%" outerRadius={90}
                      dataKey="value" nameKey="name" paddingAngle={3}>
                      {revenueMethodPie.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "#18181b", borderRadius: 8, border: "1px solid #27272a", fontSize: 12 }}
                      formatter={(v: number) => formatPeso(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2 flex-1">
                  {revenueMethodPie.map((entry, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: entry.color }} />
                        <span className="text-muted-foreground">{entry.name}</span>
                      </div>
                      <span className="font-semibold">{formatPeso(entry.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* By Plan */}
        <Card className="border-zinc-800">
          <CardHeader className="p-3 md:p-6">
            <CardTitle className="text-base md:text-lg flex items-center gap-2">
              <Wallet className="w-4 h-4 text-amber-400" />By Plan
            </CardTitle>
            <CardDescription className="text-xs">Revenue split by 1-month, 6-month, 1-year, walk-in, daily</CardDescription>
          </CardHeader>
          <CardContent className="p-2 md:p-6 md:pt-0">
            {revenuePlanPie.length === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">No data</div>
            ) : (
              <div className="flex flex-col md:flex-row items-center gap-4">
                <ResponsiveContainer width={200} height={200}>
                  <PieChart>
                    <Pie data={revenuePlanPie} cx="50%" cy="50%" outerRadius={90}
                      dataKey="value" nameKey="name" paddingAngle={3}>
                      {revenuePlanPie.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "#18181b", borderRadius: 8, border: "1px solid #27272a", fontSize: 12 }}
                      formatter={(v: number) => formatPeso(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2 flex-1">
                  {revenuePlanPie.map((entry, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: entry.color }} />
                        <span className="text-muted-foreground">{entry.name}</span>
                      </div>
                      <span className="font-semibold">{formatPeso(entry.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Revenue trend line chart by plan */}
      <Card className="border-zinc-800">
        <CardHeader className="p-3 md:p-6">
          <CardTitle className="text-base md:text-lg flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-400" />Revenue Trend by Plan
          </CardTitle>
          <CardDescription className="text-xs md:text-sm">
            Revenue per plan over {revenueRange} — each line is a membership plan
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[280px] md:h-[340px] p-2 md:p-6 md:pt-0">
          {revenueTrendData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueTrendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="label" stroke="#71717a" tick={{ fontSize: 10 }} />
                <YAxis stroke="#71717a" tick={{ fontSize: 10 }} width={55}
                  tickFormatter={v => v >= 1000 ? "\u20b1" + (v/1000).toFixed(1)+"k" : v > 0 ? "\u20b1"+v : ""} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#18181b", borderRadius: 8, border: "1px solid #27272a", fontSize: 12 }}
                  formatter={(v: number, name: string) => [formatPeso(v), name]}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                {(["1month","6months","1year","walkin","daily","other"] as PlanKey[]).map((pk) => (
                  <Line key={pk} type="monotone" dataKey={PLAN_LABELS[pk]}
                    stroke={PLAN_COLORS[pk]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      <Card className="border-zinc-800">
        <CardHeader className="p-3 md:p-6">
          <CardTitle className="text-base md:text-lg flex items-center gap-2">
            <Banknote className="w-4 h-4 text-emerald-500" />Recent Transactions
          </CardTitle>
          <CardDescription className="text-xs md:text-sm">
            Latest {recentTransactions.length} payments this {revenueRange}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 md:p-6 pt-0 md:pt-0">
          {recentTransactions.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <p className="text-sm">No transactions in this period</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
              {recentTransactions.map((txn, i) => (
                <div key={txn.paymentId ?? i}
                  className="flex items-center gap-3 p-2.5 md:p-3 rounded-lg border border-zinc-800 bg-zinc-900/30 hover:bg-zinc-800/40 transition-colors">
                  <div className="p-2 rounded-full bg-emerald-500/10 flex-shrink-0">
                    <PhilippinePeso className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {txn.userName && <span className="font-semibold text-sm truncate">{txn.userName}</span>}
                      <span className="text-[10px] text-muted-foreground font-mono">{txn.userId}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-900/50 text-indigo-300">{txn.plan}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{txn.paymentMethod}</span>
                    </div>
                    <p className="text-[10px] md:text-[11px] text-muted-foreground mt-0.5">
                      {new Date(new Date(txn.paymentDate).getTime() + PH_OFFSET_MS).toLocaleString("en-PH", {
                        year: "numeric", month: "short", day: "numeric",
                        hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "UTC"
                      })}
                    </p>
                  </div>
                  <span className="font-bold text-emerald-400 text-sm flex-shrink-0">{formatPeso(txn.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Contribution Calendar ─────────────────────────────────────────── */}
      <Card className="border-zinc-800">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 md:p-6">
          <div>
            <CardTitle className="text-base md:text-lg">Gym Activity</CardTitle>
            <CardDescription className="text-xs md:text-sm">{yearlyTotal} check-ins in {selectedYear}</CardDescription>
          </div>
          <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}
            className="border border-zinc-700 rounded px-2 md:px-3 py-1 md:py-1.5 bg-zinc-800 text-xs md:text-sm">
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto pb-2">
            <div className="flex ml-10 mb-2 min-w-fit">
              {monthLabels.map(({ label, weekIndex }, i) => (
                <div key={i} className="text-xs text-muted-foreground" style={{ position: "relative", left: `${weekIndex * 14}px` }}>{label}</div>
              ))}
            </div>
            <div className="flex gap-1 min-w-fit">
              <div className="flex flex-col gap-[3px] mr-2 text-xs text-muted-foreground">
                <div className="h-[10px]" /><div className="h-[10px] leading-[10px]">Mon</div><div className="h-[10px]" />
                <div className="h-[10px] leading-[10px]">Wed</div><div className="h-[10px]" /><div className="h-[10px] leading-[10px]">Fri</div><div className="h-[10px]" />
              </div>
              <div className="flex gap-[3px]">
                {weeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-[3px]">
                    {week.map((day, di) => {
                      const outside = day.count === -1
                      const future  = isAfter(day.date, new Date())
                      return (
                        <div key={di}
                          className={`w-[10px] h-[10px] rounded-sm transition-colors ${outside || future ? "bg-transparent" : getContributionColor(day.count, maxDayCount)}`}
                          onMouseEnter={() => !outside && !future && setHoveredDay(day)}
                          onMouseLeave={() => setHoveredDay(null)}
                          title={outside || future ? "" : `${format(day.date, "MMM d, yyyy")}: ${day.count} check-in${day.count !== 1 ? "s" : ""}`}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
              <span>Less</span>
              {[CONTRIBUTION_COLORS.empty, CONTRIBUTION_COLORS.level1, CONTRIBUTION_COLORS.level2, CONTRIBUTION_COLORS.level3, CONTRIBUTION_COLORS.level4].map((c, i) => (
                <div key={i} className={`w-[10px] h-[10px] rounded-sm ${c}`} />
              ))}
              <span>More</span>
            </div>
            {hoveredDay && (
              <div className="mt-2 text-sm">
                <span className="font-medium">{format(hoveredDay.date, "EEEE, MMMM d, yyyy")}</span>
                <span className="text-muted-foreground"> — {hoveredDay.count} check-in{hoveredDay.count !== 1 ? "s" : ""}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Line Graph ────────────────────────────────────────────────────── */}
      <Card className="border-zinc-800">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-3 md:p-6">
          <div>
            <CardTitle className="text-base md:text-lg">Active Sessions by Day and Time</CardTitle>
            <CardDescription className="text-xs md:text-sm">Each line represents a 2-hour pair.</CardDescription>
          </div>
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            <div className="flex items-center space-x-1 md:space-x-2">
              <label className="text-xs md:text-sm text-muted-foreground whitespace-nowrap">Month:</label>
              <select value={selectedMonth} onChange={e => { setSelectedMonth(e.target.value); setSelectedWeek("all") }}
                className="border border-zinc-700 rounded px-1.5 md:px-2 py-1 bg-zinc-800 text-xs md:text-sm">
                {last12Months.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
            <div className="flex items-center space-x-1 md:space-x-2">
              <label className="text-xs md:text-sm text-muted-foreground whitespace-nowrap">Week:</label>
              <select value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)}
                className="border border-zinc-700 rounded px-1.5 md:px-2 py-1 bg-zinc-800 text-xs md:text-sm min-w-[120px] md:min-w-[180px]">
                {availableWeeks.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="h-[350px] md:h-[450px] flex flex-col md:flex-row p-2 md:p-6">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <LineChart data={lineData} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="day" label={{ value: "Day of Week", position: "bottom", offset: 10 }} tick={{ fontSize: 10 }} stroke="#71717a" />
              <YAxis label={{ value: "Active Users", angle: -90, position: "insideLeft", offset: 10 }} allowDecimals={false} tick={{ fontSize: 10 }} domain={[0, "dataMax"]} stroke="#71717a" width={30} />
              <Tooltip contentStyle={{ backgroundColor: "#18181b", borderRadius: 8, border: "1px solid #27272a", fontSize: 12 }}
                formatter={(value: number, name: string) => [value, name]} labelStyle={{ fontWeight: 600 }} />
              {TIME_PAIRS.map(({ label }, index) => (
                <Line key={label} type="monotone" dataKey={label} stroke={colors[index % colors.length]}
                  strokeWidth={2} dot={false} name={label} activeDot={{ r: 5 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div className="w-full md:w-[15%] mt-2 md:mt-0 md:ml-4 flex flex-col shrink-0">
            <button className="mb-2 px-3 py-1.5 md:px-4 md:py-2 bg-indigo-600 text-white text-xs md:text-sm rounded hover:bg-indigo-700 transition"
              onClick={() => setLegendOpen(prev => !prev)}>
              {legendOpen ? "Hide Legend" : "Show Legend"}
            </button>
            {legendOpen && (
              <div className="overflow-y-auto border border-zinc-700 rounded p-2 max-h-[200px] md:max-h-[350px] grid grid-cols-2 md:grid-cols-1 gap-1" style={{ scrollbarWidth: "thin" }}>
                {TIME_PAIRS.map(({ label }, index) => (
                  <div key={label} className="flex items-center mb-1 md:mb-2">
                    <div className="w-3 h-3 md:w-4 md:h-4 rounded mr-1.5 md:mr-2 flex-shrink-0" style={{ backgroundColor: colors[index % colors.length] }} />
                    <span className="text-[10px] md:text-xs">{label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Monthly Trend ─────────────────────────────────────────────────── */}
      <Card className="border-zinc-800">
        <CardHeader className="p-3 md:p-6">
          <CardTitle className="text-base md:text-lg">Monthly Check-ins</CardTitle>
          <CardDescription className="text-xs md:text-sm">Last 12 months trend</CardDescription>
        </CardHeader>
        <CardContent className="h-[220px] md:h-[280px] p-2 md:p-6">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="month" stroke="#71717a" tick={{ fontSize: 10 }} />
              <YAxis stroke="#71717a" tick={{ fontSize: 10 }} width={30} />
              <Tooltip contentStyle={{ backgroundColor: "#18181b", borderRadius: 8, border: "1px solid #27272a", fontSize: 12 }} />
              <Line type="monotone" dataKey="checkIns" stroke="#10b981" strokeWidth={2}
                dot={{ fill: "#10b981", r: 2 }} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
