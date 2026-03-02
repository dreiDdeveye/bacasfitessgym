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
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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
  isWithinInterval,
} from "date-fns"
import type { ScanLog } from "@/src/types"
import { storageService } from "@/src/services/storage.service"
import { TrendingUp, TrendingDown, Minus, Clock, Users, Calendar, Activity, Moon } from "lucide-react"

// ─── Philippine Time helpers (UTC+8) ─────────────────────────────────────────
// Supabase stores timestamps as UTC. We shift by +8h then use getUTC*() methods
// so JS local timezone never interferes with date grouping.
const PH_OFFSET_MS = 8 * 60 * 60 * 1000

/** Shifts a UTC timestamp by +8h. Always use .getUTC*() on the result. */
function toPHDate(timestamp: string): Date {
  return new Date(new Date(timestamp).getTime() + PH_OFFSET_MS)
}

/** Returns "YYYY-MM-DD" in PH time */
function toPHDateString(timestamp: string): string {
  const d = toPHDate(timestamp)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

/**
 * Returns current PH date fields as plain numbers.
 * NEVER pass the raw shifted Date to date-fns functions or .toISOString() —
 * that would double-apply the +8h offset.
 */
function nowPH() {
  const d = toPHDate(new Date().toISOString())
  return {
    year:  d.getUTCFullYear(),
    month: d.getUTCMonth(),   // 0-indexed
    str:   `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
  }
}

function phYear(ts: string)      { return toPHDate(ts).getUTCFullYear() }
function phMonth(ts: string)     { return toPHDate(ts).getUTCMonth() }
function phDayOfWeek(ts: string) { return toPHDate(ts).getUTCDay() }
function phHour(ts: string)      { return toPHDate(ts).getUTCHours() }
// ─────────────────────────────────────────────────────────────────────────────

interface MonthlyData {
  month: string
  checkIns: number
}

interface ContributionDay {
  date: Date
  count: number
  dateString: string
}

interface TimePair {
  label: string
  start: number
  end: number
}

type TimeRange = "today" | "week" | "month" | "year" | "all"

const TIME_PAIRS: TimePair[] = Array.from({ length: 12 }, (_, i) => {
  const start = 1 + i * 2
  const end = start + 1
  const formatHour = (h: number) => {
    const hour12 = ((h - 1) % 12) + 1
    const ampm = h >= 12 && h < 24 ? "PM" : "AM"
    return `${hour12} ${ampm}`
  }
  return { label: `${formatHour(start)} - ${formatHour(end)}`, start, end }
})

const last12Months = Array.from({ length: 12 }, (_, i) => {
  const date = subMonths(new Date(), 11 - i)
  return { key: format(date, "yyyy-MM"), label: format(date, "MMM yyyy") }
})

function formatHourLabel(hour24: number): string {
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  const ampm = hour24 < 12 ? "AM" : "PM"
  return `${hour12} ${ampm}`
}

const colors = [
  "#4f46e5", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#ec4899",
  "#22d3ee", "#f97316", "#a855f7", "#14b8a6", "#f43f5e", "#8b5cf6",
]

const CONTRIBUTION_COLORS = {
  empty:  "bg-zinc-800",
  level1: "bg-emerald-900",
  level2: "bg-emerald-700",
  level3: "bg-emerald-500",
  level4: "bg-emerald-400",
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function Sparkline({ data, color = "#10b981" }: { data: number[]; color?: string }) {
  if (data.length < 2) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
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

function TrendIndicator({ current, previous, suffix = "" }: { current: number; previous: number; suffix?: string }) {
  if (previous === 0 && current === 0)
    return <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Minus className="w-3 h-3" /> No change</span>
  const diff = current - previous
  const pct = previous > 0 ? Math.round((diff / previous) * 100) : (current > 0 ? 100 : 0)
  if (diff > 0) return <span className="text-[11px] text-emerald-500 flex items-center gap-1"><TrendingUp className="w-3 h-3" />+{pct}% {suffix}</span>
  if (diff < 0) return <span className="text-[11px] text-red-400 flex items-center gap-1"><TrendingDown className="w-3 h-3" />{pct}% {suffix}</span>
  return <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Minus className="w-3 h-3" /> No change</span>
}

export function AnalyticsDashboard() {
  const [monthlyData, setMonthlyData]     = useState<MonthlyData[]>([])
  const [totalCheckIns, setTotalCheckIns] = useState(0)
  const [peakHour, setPeakHour]           = useState<number | null>(null)
  const [quietestHour, setQuietestHour]   = useState<number | null>(null)
  const [busiestDay, setBusiestDay]       = useState<number | null>(null)
  const [lineData, setLineData]           = useState<any[]>([])
  const [legendOpen, setLegendOpen]       = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(last12Months[11].key)
  const [selectedWeek, setSelectedWeek]   = useState("all")
  const [allValidLogs, setAllValidLogs]   = useState<ScanLog[]>([])
  const [contributionData, setContributionData] = useState<ContributionDay[]>([])
  const [selectedYear, setSelectedYear]   = useState(new Date().getFullYear())
  const [yearlyTotal, setYearlyTotal]     = useState(0)
  const [hoveredDay, setHoveredDay]       = useState<ContributionDay | null>(null)
  const [timeRange, setTimeRange]         = useState<TimeRange>("month")

  const [thisMonthCount, setThisMonthCount]   = useState(0)
  const [lastMonthCount, setLastMonthCount]   = useState(0)
  const [thisWeekCount, setThisWeekCount]     = useState(0)
  const [lastWeekCount, setLastWeekCount]     = useState(0)
  const [todayCount, setTodayCount]           = useState(0)
  const [yesterdayCount, setYesterdayCount]   = useState(0)
  const [previousPeakHour, setPreviousPeakHour] = useState<number | null>(null)

  const [weeklyBreakdown, setWeeklyBreakdown]   = useState<{ label: string; value: number }[]>([])
  const [last7DaysData, setLast7DaysData]       = useState<number[]>([])
  const [hourlyDistribution, setHourlyDistribution] = useState<number[]>([])

  const [filteredPeakHour, setFilteredPeakHour]         = useState<number | null>(null)
  const [filteredQuietestHour, setFilteredQuietestHour] = useState<number | null>(null)
  const [filteredBusiestDay, setFilteredBusiestDay]     = useState<number | null>(null)
  const [filteredWeeklyBreakdown, setFilteredWeeklyBreakdown] = useState<{ label: string; value: number }[]>([])
  const [filteredHourlyDistribution, setFilteredHourlyDistribution] = useState<number[]>([])
  const [filteredAvgDaily, setFilteredAvgDaily] = useState(0)

  const getAvailableWeeks = () => {
    const [year, month] = selectedMonth.split("-").map(Number)
    const monthStart = new Date(year, month - 1, 1)
    const monthEnd   = endOfMonth(monthStart)
    const weeks: { value: string; label: string }[] = [{ value: "all", label: "All Weeks" }]
    let currentWeek = 1
    let currentDate = monthStart
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

  useEffect(() => { loadAnalytics() }, [])

  useEffect(() => {
    if (allValidLogs.length) {
      updateLineDataForMonth(selectedMonth, selectedWeek)
      generateContributionData(selectedYear)
    }
  }, [allValidLogs, selectedMonth, selectedYear, selectedWeek])

  // ── Time-range filtered stats ─────────────────────────────────────────────
  useEffect(() => {
    if (allValidLogs.length === 0) return

    const ph      = nowPH()
    const realNow = new Date() // use real Date for date-fns functions

    const todayStr = ph.str
    const thisWeekStartStr = toPHDateString(
      getStartOfWeek(realNow, { weekStartsOn: 0 }).toISOString()
    )

    let filteredLogs: ScanLog[] = []
    let daysInRange = 1

    switch (timeRange) {
      case "today":
        filteredLogs = allValidLogs.filter(l => toPHDateString(l.timestamp) === todayStr)
        daysInRange = 1
        break
      case "week":
        filteredLogs = allValidLogs.filter(l => toPHDateString(l.timestamp) >= thisWeekStartStr)
        daysInRange = 7
        break
      case "month":
        filteredLogs = allValidLogs.filter(l =>
          phYear(l.timestamp) === ph.year && phMonth(l.timestamp) === ph.month
        )
        daysInRange = getDaysInMonth(realNow)
        break
      case "year":
        filteredLogs = allValidLogs.filter(l => phYear(l.timestamp) === ph.year)
        daysInRange = 12
        break
      case "all":
      default:
        filteredLogs = allValidLogs
        daysInRange = 365
        break
    }

    daysInRange = Math.max(1, daysInRange)

    const hourMap = new Map<number, number>()
    filteredLogs.forEach(log => {
      const h = phHour(log.timestamp)
      hourMap.set(h, (hourMap.get(h) || 0) + 1)
    })
    let maxHour: number | null = null, maxCount = 0
    let minHour: number | null = null, minCount = Infinity
    hourMap.forEach((count, hour) => {
      if (count > maxCount) { maxCount = count; maxHour = hour }
      if (hour >= 5 && hour <= 23 && count < minCount && count > 0) { minCount = count; minHour = hour }
    })
    setFilteredPeakHour(maxHour)
    setFilteredQuietestHour(minHour)
    setFilteredHourlyDistribution(Array.from({ length: 24 }, (_, i) => hourMap.get(i) || 0))

    const dayMap = new Map<number, number>()
    filteredLogs.forEach(log => {
      const d = phDayOfWeek(log.timestamp)
      dayMap.set(d, (dayMap.get(d) || 0) + 1)
    })
    let maxDay: number | null = null, maxDayCount = 0
    dayMap.forEach((count, day) => { if (count > maxDayCount) { maxDayCount = count; maxDay = day } })
    setFilteredBusiestDay(maxDay)
    setFilteredWeeklyBreakdown(DAY_SHORT.map((label, i) => ({ label, value: dayMap.get(i) || 0 })))
    setFilteredAvgDaily(Math.round(filteredLogs.length / daysInRange))

  }, [timeRange, allValidLogs])

  // ── Main analytics loader ─────────────────────────────────────────────────
  async function loadAnalytics() {
    const logs = await storageService.getScanLogs()

    // ── DEBUG: remove after fixing ──────────────────────────────────────────
    console.log("🔍 TOTAL LOGS FETCHED:", logs.length)
    if (logs[0]) {
      console.log("🔍 FIRST LOG raw timestamp:", logs[0].timestamp)
      console.log("🔍 FIRST LOG action:", logs[0].action, "| status:", logs[0].status)
    }
    const validLogs = logs.filter(l => l.action === "check-in" && l.status === "success")
    console.log("🔍 VALID CHECK-INS:", validLogs.length)
    const janRaw = validLogs.filter(l => {
      const ts = l.timestamp as string
      return ts.startsWith("2026-01") || ts.includes("-01-")
    })
    console.log("🔍 JAN LOGS (raw UTC startsWith 2026-01):", janRaw.length)
    const janPH = validLogs.filter(l => {
      const d = new Date(new Date(l.timestamp).getTime() + 8 * 60 * 60 * 1000)
      return d.getUTCFullYear() === 2026 && d.getUTCMonth() === 0
    })
    console.log("🔍 JAN LOGS (PH timezone):", janPH.length)
    const febPH = validLogs.filter(l => {
      const d = new Date(new Date(l.timestamp).getTime() + 8 * 60 * 60 * 1000)
      return d.getUTCFullYear() === 2026 && d.getUTCMonth() === 1
    })
    console.log("🔍 FEB LOGS (PH timezone):", febPH.length)
    // ── END DEBUG ────────────────────────────────────────────────────────────

    setAllValidLogs(validLogs)
    setTotalCheckIns(validLogs.length)

    const ph      = nowPH()
    const realNow = new Date() // use real Date for date-fns, NOT the shifted ph object

    const todayStr     = ph.str
    const yesterdayStr = toPHDateString(subDays(realNow, 1).toISOString())

    const thisWeekStartStr = toPHDateString(
      getStartOfWeek(realNow, { weekStartsOn: 0 }).toISOString()
    )
    const lastWeekStartStr = toPHDateString(
      subDays(getStartOfWeek(realNow, { weekStartsOn: 0 }), 7).toISOString()
    )
    const lastWeekEndStr = toPHDateString(
      subDays(getStartOfWeek(realNow, { weekStartsOn: 0 }), 1).toISOString()
    )

    const thisMonthY = ph.year
    const thisMonthM = ph.month

    // Last month: subtract from real date, then read in PH time
    const lastMonthDate = subMonths(realNow, 1)
    const lastMonthY    = toPHDate(lastMonthDate.toISOString()).getUTCFullYear()
    const lastMonthM    = toPHDate(lastMonthDate.toISOString()).getUTCMonth()

    // Today vs Yesterday
    setTodayCount(validLogs.filter(l => toPHDateString(l.timestamp) === todayStr).length)
    setYesterdayCount(validLogs.filter(l => toPHDateString(l.timestamp) === yesterdayStr).length)

    // This month vs Last month
    const thisMonthLogs = validLogs.filter(l => phYear(l.timestamp) === thisMonthY && phMonth(l.timestamp) === thisMonthM)
    const lastMonthLogs = validLogs.filter(l => phYear(l.timestamp) === lastMonthY  && phMonth(l.timestamp) === lastMonthM)
    setThisMonthCount(thisMonthLogs.length)
    setLastMonthCount(lastMonthLogs.length)

    // This week vs Last week
    setThisWeekCount(validLogs.filter(l => toPHDateString(l.timestamp) >= thisWeekStartStr).length)
    setLastWeekCount(validLogs.filter(l => {
      const s = toPHDateString(l.timestamp)
      return s >= lastWeekStartStr && s <= lastWeekEndStr
    }).length)

    // Peak / quietest hour
    const hourMap = new Map<number, number>()
    validLogs.forEach(log => {
      const h = phHour(log.timestamp)
      hourMap.set(h, (hourMap.get(h) || 0) + 1)
    })
    let maxHour: number | null = null, maxCount = 0
    let minHour: number | null = null, minCount = Infinity
    hourMap.forEach((count, hour) => {
      if (count > maxCount) { maxCount = count; maxHour = hour }
      if (hour >= 5 && hour <= 23 && count < minCount && count > 0) { minCount = count; minHour = hour }
    })
    setPeakHour(maxHour)
    setQuietestHour(minHour)
    setHourlyDistribution(Array.from({ length: 24 }, (_, i) => hourMap.get(i) || 0))

    // Previous month peak hour
    const pmHourMap = new Map<number, number>()
    lastMonthLogs.forEach(log => {
      const h = phHour(log.timestamp)
      pmHourMap.set(h, (pmHourMap.get(h) || 0) + 1)
    })
    let prevMaxHour: number | null = null, prevMaxCount = 0
    pmHourMap.forEach((count, hour) => { if (count > prevMaxCount) { prevMaxCount = count; prevMaxHour = hour } })
    setPreviousPeakHour(prevMaxHour)

    // Busiest day
    const dayMap = new Map<number, number>()
    validLogs.forEach(log => {
      const d = phDayOfWeek(log.timestamp)
      dayMap.set(d, (dayMap.get(d) || 0) + 1)
    })
    let maxDay: number | null = null, maxDayCount = 0
    dayMap.forEach((count, day) => { if (count > maxDayCount) { maxDayCount = count; maxDay = day } })
    setBusiestDay(maxDay)
    setWeeklyBreakdown(DAY_SHORT.map((label, i) => ({ label, value: dayMap.get(i) || 0 })))

    // Last 7 days sparkline
    const last7: number[] = []
    for (let i = 6; i >= 0; i--) {
      const s = toPHDateString(subDays(realNow, i).toISOString())
      last7.push(validLogs.filter(l => toPHDateString(l.timestamp) === s).length)
    }
    setLast7DaysData(last7)

    // Monthly trend — use real dates for subMonths, read year/month in PH time
    const monthly: MonthlyData[] = []
    for (let i = 11; i >= 0; i--) {
      const monthDate = subMonths(realNow, i)
      const y = toPHDate(monthDate.toISOString()).getUTCFullYear()
      const m = toPHDate(monthDate.toISOString()).getUTCMonth()
      monthly.push({
        month: format(monthDate, "MMM"),
        checkIns: validLogs.filter(l => phYear(l.timestamp) === y && phMonth(l.timestamp) === m).length
      })
    }
    setMonthlyData(monthly)
  }

  // ── Contribution heatmap ──────────────────────────────────────────────────
  function generateContributionData(year: number) {
    const yearStart = startOfYear(new Date(year, 0, 1))
    const yearEnd   = endOfYear(new Date(year, 0, 1))
    const allDays   = eachDayOfInterval({ start: yearStart, end: yearEnd })

    const dayCountMap = new Map<string, number>()
    allValidLogs.forEach(log => {
      const dateKey = toPHDateString(log.timestamp)
      if (dateKey.startsWith(String(year))) {
        dayCountMap.set(dateKey, (dayCountMap.get(dateKey) || 0) + 1)
      }
    })

    setContributionData(allDays.map(date => {
      const dateString = format(date, "yyyy-MM-dd")
      return { date, count: dayCountMap.get(dateString) || 0, dateString }
    }))
    setYearlyTotal(Array.from(dayCountMap.values()).reduce((sum, c) => sum + c, 0))
  }

  // ── Line chart ────────────────────────────────────────────────────────────
  function updateLineDataForMonth(monthKey: string, weekFilter: string) {
    let filteredLogs = allValidLogs.filter(log => {
      const y = phYear(log.timestamp)
      const m = phMonth(log.timestamp) + 1
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
      const wsStr = format(weekStart, "yyyy-MM-dd")
      const weStr = format(weekEnd,   "yyyy-MM-dd")

      filteredLogs = filteredLogs.filter(log => {
        const s = toPHDateString(log.timestamp)
        return s >= wsStr && s <= weStr
      })
    }

    const data: any[] = []
    for (let day = 0; day < 7; day++) {
      const obj: any = { day: DAY_SHORT[day] }
      TIME_PAIRS.forEach(({ label, start, end }) => {
        obj[label] = filteredLogs.filter(log => {
          const h  = phHour(log.timestamp)
          const nh = h === 0 ? 24 : h
          return phDayOfWeek(log.timestamp) === day && (nh === start || nh === end)
        }).length
      })
      data.push(obj)
    }
    setLineData(data)
  }

  function getContributionColor(count: number, maxCount: number): string {
    if (count === 0) return CONTRIBUTION_COLORS.empty
    const r = count / maxCount
    if (r <= 0.25) return CONTRIBUTION_COLORS.level1
    if (r <= 0.5)  return CONTRIBUTION_COLORS.level2
    if (r <= 0.75) return CONTRIBUTION_COLORS.level3
    return CONTRIBUTION_COLORS.level4
  }

  function getWeeksData() {
    if (contributionData.length === 0) return []
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
      const firstValidDay = week.find(d => d.count >= 0)
      if (firstValidDay) {
        const month = firstValidDay.date.getMonth()
        if (month !== currentMonth) {
          currentMonth = month
          months.push({ label: format(firstValidDay.date, "MMM"), weekIndex })
        }
      }
    })
    return months
  }

  const weeks       = getWeeksData()
  const monthLabels = getMonthLabels()
  const maxDayCount = Math.max(...contributionData.map(d => d.count), 1)
  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i)
  const availableWeeks = getAvailableWeeks()

  const getDisplayCount = () => ({ today: todayCount, week: thisWeekCount, month: thisMonthCount, year: yearlyTotal, all: totalCheckIns }[timeRange])
  const getPreviousCount = () => ({ today: yesterdayCount, week: lastWeekCount, month: lastMonthCount, year: 0, all: 0 }[timeRange])
  const getComparisonLabel = () => ({ today: "vs yesterday", week: "vs last week", month: "vs last month", year: "", all: "" }[timeRange])

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <div className="flex items-center gap-2 md:gap-3 flex-wrap">
        <span className="text-xs md:text-sm text-muted-foreground">View:</span>
        <div className="flex gap-0.5 md:gap-1 bg-zinc-800/50 rounded-lg p-1 overflow-x-auto">
          {(["today", "week", "month", "year", "all"] as TimeRange[]).map((range) => (
            <button key={range} onClick={() => setTimeRange(range)}
              className={`px-2 md:px-3 py-1 md:py-1.5 text-xs md:text-sm rounded-md transition-all whitespace-nowrap ${timeRange === range ? "bg-emerald-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-zinc-700/50"}`}>
              {range.charAt(0).toUpperCase() + range.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Primary Stats */}
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

      {/* Secondary Stats */}
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

      {/* Contribution Calendar */}
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

      {/* Line Graph */}
      <Card className="border-zinc-800">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-3 md:p-6">
          <div>
            <CardTitle className="text-base md:text-lg">Active Sessions by Day and Time</CardTitle>
            <CardDescription className="text-xs md:text-sm">Each line represents a 2-hour pair.</CardDescription>
          </div>
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            <div className="flex items-center space-x-1 md:space-x-2">
              <label htmlFor="monthPicker" className="text-xs md:text-sm text-muted-foreground whitespace-nowrap">Month:</label>
              <select id="monthPicker" value={selectedMonth}
                onChange={e => { setSelectedMonth(e.target.value); setSelectedWeek("all") }}
                className="border border-zinc-700 rounded px-1.5 md:px-2 py-1 bg-zinc-800 text-xs md:text-sm">
                {last12Months.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
            <div className="flex items-center space-x-1 md:space-x-2">
              <label htmlFor="weekPicker" className="text-xs md:text-sm text-muted-foreground whitespace-nowrap">Week:</label>
              <select id="weekPicker" value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)}
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

      {/* Monthly Trend */}
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