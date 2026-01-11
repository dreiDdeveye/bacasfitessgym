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
  getDay,
  getHours,
  format,
  subMonths,
  startOfYear,
  endOfYear,
  eachDayOfInterval,
  startOfWeek,
  isAfter,
  subDays,
  startOfMonth,
  endOfMonth,
  startOfWeek as getStartOfWeek,
} from "date-fns"
import type { ScanLog } from "@/src/types"
import { storageService } from "@/src/services/storage.service"
import { TrendingUp, TrendingDown, Minus, Clock, Users, Calendar, Activity, Moon } from "lucide-react"

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
  return {
    label: `${formatHour(start)} - ${formatHour(end)}`,
    start,
    end,
  }
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
  empty: "bg-zinc-800",
  level1: "bg-emerald-900",
  level2: "bg-emerald-700",
  level3: "bg-emerald-500",
  level4: "bg-emerald-400",
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

// Mini Sparkline Component
function Sparkline({ data, color = "#10b981" }: { data: number[]; color?: string }) {
  if (data.length < 2) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const width = 60
  const height = 20
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x},${y}`
  }).join(" ")

  return (
    <svg width={width} height={height} className="opacity-70">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}

// Mini Bar Chart Component
function MiniBarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="flex items-end gap-[2px] h-5">
      {data.map((d, i) => (
        <div
          key={i}
          className="w-[6px] bg-emerald-500/80 rounded-sm transition-all hover:bg-emerald-400"
          style={{ height: `${Math.max((d.value / max) * 100, d.value > 0 ? 10 : 0)}%` }}
          title={`${d.label}: ${d.value}`}
        />
      ))}
    </div>
  )
}

// Trend Indicator Component
function TrendIndicator({ current, previous, suffix = "" }: { current: number; previous: number; suffix?: string }) {
  if (previous === 0 && current === 0) {
    return <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Minus className="w-3 h-3" /> No change</span>
  }
  
  const diff = current - previous
  const percentChange = previous > 0 ? Math.round((diff / previous) * 100) : (current > 0 ? 100 : 0)
  
  if (diff > 0) {
    return (
      <span className="text-[11px] text-emerald-500 flex items-center gap-1">
        <TrendingUp className="w-3 h-3" />
        +{percentChange}% {suffix}
      </span>
    )
  } else if (diff < 0) {
    return (
      <span className="text-[11px] text-red-400 flex items-center gap-1">
        <TrendingDown className="w-3 h-3" />
        {percentChange}% {suffix}
      </span>
    )
  }
  return <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Minus className="w-3 h-3" /> No change</span>
}

export function AnalyticsDashboard() {
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([])
  const [totalCheckIns, setTotalCheckIns] = useState(0)
  const [peakHour, setPeakHour] = useState<number | null>(null)
  const [quietestHour, setQuietestHour] = useState<number | null>(null)
  const [busiestDay, setBusiestDay] = useState<number | null>(null)
  const [avgDailyCheckIns, setAvgDailyCheckIns] = useState(0)
  const [lineData, setLineData] = useState<any[]>([])
  const [legendOpen, setLegendOpen] = useState<boolean>(false)
  const [selectedMonth, setSelectedMonth] = useState<string>(last12Months[11].key)
  const [allValidLogs, setAllValidLogs] = useState<ScanLog[]>([])
  const [contributionData, setContributionData] = useState<ContributionDay[]>([])
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
  const [yearlyTotal, setYearlyTotal] = useState(0)
  const [hoveredDay, setHoveredDay] = useState<ContributionDay | null>(null)
  const [timeRange, setTimeRange] = useState<TimeRange>("month")
  
  // Comparison data
  const [thisMonthCount, setThisMonthCount] = useState(0)
  const [lastMonthCount, setLastMonthCount] = useState(0)
  const [thisWeekCount, setThisWeekCount] = useState(0)
  const [lastWeekCount, setLastWeekCount] = useState(0)
  const [todayCount, setTodayCount] = useState(0)
  const [yesterdayCount, setYesterdayCount] = useState(0)
  const [previousPeakHour, setPreviousPeakHour] = useState<number | null>(null)
  
  // Chart data
  const [weeklyBreakdown, setWeeklyBreakdown] = useState<{ label: string; value: number }[]>([])
  const [last7DaysData, setLast7DaysData] = useState<number[]>([])
  const [hourlyDistribution, setHourlyDistribution] = useState<number[]>([])

  useEffect(() => {
    loadAnalytics()
  }, [])

  useEffect(() => {
    if (allValidLogs.length) {
      updateLineDataForMonth(selectedMonth)
      generateContributionData(selectedYear)
    }
  }, [allValidLogs, selectedMonth, selectedYear])

  async function loadAnalytics() {
    const logs = await storageService.getScanLogs()
    const validLogs = logs.filter(
      (l) => l.action === "check-in" && l.status === "success"
    )
    setAllValidLogs(validLogs)
    setTotalCheckIns(validLogs.length)

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterdayStart = subDays(todayStart, 1)
    const thisMonthStart = startOfMonth(now)
    const lastMonthStart = startOfMonth(subMonths(now, 1))
    const lastMonthEnd = endOfMonth(subMonths(now, 1))
    const thisWeekStart = getStartOfWeek(now, { weekStartsOn: 0 })
    const lastWeekStart = subDays(thisWeekStart, 7)
    const lastWeekEnd = subDays(thisWeekStart, 1)

    // Today vs Yesterday
    const todayLogs = validLogs.filter(l => new Date(l.timestamp) >= todayStart)
    const yesterdayLogs = validLogs.filter(l => {
      const d = new Date(l.timestamp)
      return d >= yesterdayStart && d < todayStart
    })
    setTodayCount(todayLogs.length)
    setYesterdayCount(yesterdayLogs.length)

    // This month vs Last month
    const thisMonthLogs = validLogs.filter(l => new Date(l.timestamp) >= thisMonthStart)
    const lastMonthLogs = validLogs.filter(l => {
      const d = new Date(l.timestamp)
      return d >= lastMonthStart && d <= lastMonthEnd
    })
    setThisMonthCount(thisMonthLogs.length)
    setLastMonthCount(lastMonthLogs.length)

    // This week vs Last week
    const thisWeekLogs = validLogs.filter(l => new Date(l.timestamp) >= thisWeekStart)
    const lastWeekLogs = validLogs.filter(l => {
      const d = new Date(l.timestamp)
      return d >= lastWeekStart && d <= lastWeekEnd
    })
    setThisWeekCount(thisWeekLogs.length)
    setLastWeekCount(lastWeekLogs.length)

    // Peak hour calculation
    const hourMap = new Map<number, number>()
    validLogs.forEach((log) => {
      const date = new Date(log.timestamp)
      if (isNaN(date.getTime())) return
      const hour = getHours(date)
      hourMap.set(hour, (hourMap.get(hour) || 0) + 1)
    })
    
    let maxHour: number | null = null
    let maxCount = 0
    let minHour: number | null = null
    let minCount = Infinity
    
    // Consider hours 5 AM - 11 PM for quietest
    hourMap.forEach((count, hour) => {
      if (count > maxCount) {
        maxCount = count
        maxHour = hour
      }
      if (hour >= 5 && hour <= 23 && count < minCount && count > 0) {
        minCount = count
        minHour = hour
      }
    })
    setPeakHour(maxHour)
    setQuietestHour(minHour)

    // Hourly distribution for sparkline
    const hourlyData = Array.from({ length: 24 }, (_, i) => hourMap.get(i) || 0)
    setHourlyDistribution(hourlyData)

    // Previous month peak hour
    const lastMonthHourMap = new Map<number, number>()
    lastMonthLogs.forEach((log) => {
      const hour = getHours(new Date(log.timestamp))
      lastMonthHourMap.set(hour, (lastMonthHourMap.get(hour) || 0) + 1)
    })
    let prevMaxHour: number | null = null
    let prevMaxCount = 0
    lastMonthHourMap.forEach((count, hour) => {
      if (count > prevMaxCount) {
        prevMaxCount = count
        prevMaxHour = hour
      }
    })
    setPreviousPeakHour(prevMaxHour)

    // Busiest day of week
    const dayMap = new Map<number, number>()
    validLogs.forEach((log) => {
      const date = new Date(log.timestamp)
      if (isNaN(date.getTime())) return
      const day = getDay(date)
      dayMap.set(day, (dayMap.get(day) || 0) + 1)
    })
    
    let maxDay: number | null = null
    let maxDayCount = 0
    dayMap.forEach((count, day) => {
      if (count > maxDayCount) {
        maxDayCount = count
        maxDay = day
      }
    })
    setBusiestDay(maxDay)

    // Weekly breakdown for mini bar chart
    const weekBreakdown = DAY_SHORT.map((label, i) => ({
      label,
      value: dayMap.get(i) || 0
    }))
    setWeeklyBreakdown(weekBreakdown)

    // Last 7 days data for sparkline
    const last7Days: number[] = []
    for (let i = 6; i >= 0; i--) {
      const dayStart = subDays(todayStart, i)
      const dayEnd = subDays(todayStart, i - 1)
      const count = validLogs.filter(l => {
        const d = new Date(l.timestamp)
        return d >= dayStart && d < dayEnd
      }).length
      last7Days.push(count)
    }
    setLast7DaysData(last7Days)

    // Average daily check-ins (last 30 days)
    const last30DaysStart = subDays(now, 30)
    const last30DaysLogs = validLogs.filter(l => new Date(l.timestamp) >= last30DaysStart)
    const avgDaily = Math.round(last30DaysLogs.length / 30)
    setAvgDailyCheckIns(avgDaily)

    // Monthly trend
    const monthly: MonthlyData[] = []
    for (let i = 11; i >= 0; i--) {
      const monthDate = subMonths(new Date(), i)
      const key = format(monthDate, "yyyy-MM")
      const count = validLogs.filter(
        (log) => format(new Date(log.timestamp), "yyyy-MM") === key
      ).length
      monthly.push({
        month: format(monthDate, "MMM"),
        checkIns: count,
      })
    }
    setMonthlyData(monthly)
  }

  function generateContributionData(year: number) {
    const yearStart = startOfYear(new Date(year, 0, 1))
    const yearEnd = endOfYear(new Date(year, 0, 1))

    const allDays = eachDayOfInterval({ start: yearStart, end: yearEnd })

    const dayCountMap = new Map<string, number>()
    allValidLogs.forEach((log) => {
      const logDate = new Date(log.timestamp)
      if (logDate.getFullYear() === year) {
        const dateKey = format(logDate, "yyyy-MM-dd")
        dayCountMap.set(dateKey, (dayCountMap.get(dateKey) || 0) + 1)
      }
    })

    const contribution: ContributionDay[] = allDays.map((date) => {
      const dateString = format(date, "yyyy-MM-dd")
      return {
        date,
        count: dayCountMap.get(dateString) || 0,
        dateString,
      }
    })

    setContributionData(contribution)

    const total = Array.from(dayCountMap.values()).reduce((sum, c) => sum + c, 0)
    setYearlyTotal(total)
  }

  function updateLineDataForMonth(monthKey: string) {
    const filteredLogs = allValidLogs.filter(
      (log) => format(new Date(log.timestamp), "yyyy-MM") === monthKey
    )
    const data: any[] = []
    for (let day = 0; day < 7; day++) {
      const dayLabel = DAY_SHORT[day]
      const obj: any = { day: dayLabel }
      TIME_PAIRS.forEach(({ label, start, end }) => {
        const count = filteredLogs.filter((log) => {
          const date = new Date(log.timestamp)
          const hour = getHours(date)
          const normalizedHour = hour === 0 ? 24 : hour
          return (
            getDay(date) === day &&
            (normalizedHour === start || normalizedHour === end) &&
            log.action === "check-in" &&
            log.status === "success"
          )
        }).length
        obj[label] = count
      })
      data.push(obj)
    }
    setLineData(data)
  }

  function getContributionColor(count: number, maxCount: number): string {
    if (count === 0) return CONTRIBUTION_COLORS.empty
    const ratio = count / maxCount
    if (ratio <= 0.25) return CONTRIBUTION_COLORS.level1
    if (ratio <= 0.5) return CONTRIBUTION_COLORS.level2
    if (ratio <= 0.75) return CONTRIBUTION_COLORS.level3
    return CONTRIBUTION_COLORS.level4
  }

  function getWeeksData() {
    if (contributionData.length === 0) return []

    const weeks: ContributionDay[][] = []
    let currentWeek: ContributionDay[] = []

    const yearStart = new Date(selectedYear, 0, 1)
    const firstSunday = startOfWeek(yearStart, { weekStartsOn: 0 })

    const daysBeforeYear = eachDayOfInterval({
      start: firstSunday,
      end: new Date(selectedYear, 0, 0),
    })

    daysBeforeYear.forEach((date) => {
      currentWeek.push({
        date,
        count: -1,
        dateString: format(date, "yyyy-MM-dd"),
      })
    })

    contributionData.forEach((day) => {
      currentWeek.push(day)

      if (currentWeek.length === 7) {
        weeks.push(currentWeek)
        currentWeek = []
      }
    })

    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push({
          date: new Date(),
          count: -1,
          dateString: "",
        })
      }
      weeks.push(currentWeek)
    }

    return weeks
  }

  function getMonthLabels() {
    const months: { label: string; weekIndex: number }[] = []
    const weeks = getWeeksData()

    let currentMonth = -1
    weeks.forEach((week, weekIndex) => {
      const firstValidDay = week.find((d) => d.count >= 0)
      if (firstValidDay) {
        const month = firstValidDay.date.getMonth()
        if (month !== currentMonth) {
          currentMonth = month
          months.push({
            label: format(firstValidDay.date, "MMM"),
            weekIndex,
          })
        }
      }
    })

    return months
  }

  const weeks = getWeeksData()
  const monthLabels = getMonthLabels()
  const maxDayCount = Math.max(...contributionData.map((d) => d.count), 1)

  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i)

  // Get current display count based on time range
  const getDisplayCount = () => {
    switch (timeRange) {
      case "today": return todayCount
      case "week": return thisWeekCount
      case "month": return thisMonthCount
      case "year": return yearlyTotal
      case "all": return totalCheckIns
    }
  }

  const getPreviousCount = () => {
    switch (timeRange) {
      case "today": return yesterdayCount
      case "week": return lastWeekCount
      case "month": return lastMonthCount
      default: return 0
    }
  }

  const getComparisonLabel = () => {
    switch (timeRange) {
      case "today": return "vs yesterday"
      case "week": return "vs last week"
      case "month": return "vs last month"
      default: return ""
    }
  }

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground">View:</span>
        <div className="flex gap-1 bg-zinc-800/50 rounded-lg p-1">
          {(["today", "week", "month", "year", "all"] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1.5 text-sm rounded-md transition-all ${
                timeRange === range
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-zinc-700/50"
              }`}
            >
              {range.charAt(0).toUpperCase() + range.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Primary Stats - 4 columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Check-ins */}
        <Card className="bg-zinc-900/30 border-zinc-800">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="flex items-center gap-2 text-xs">
                <Users className="w-3.5 h-3.5" />
                Check-ins
              </CardDescription>
              <Sparkline data={last7DaysData} />
            </div>
            <CardTitle className="text-3xl font-bold tracking-tight">{getDisplayCount()}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {timeRange !== "year" && timeRange !== "all" && (
              <TrendIndicator 
                current={getDisplayCount()} 
                previous={getPreviousCount()} 
                suffix={getComparisonLabel()}
              />
            )}
            <p className="text-[10px] text-muted-foreground mt-1.5 leading-tight">
              All recorded entries for {timeRange === "all" ? "all time" : `this ${timeRange}`}
            </p>
          </CardContent>
        </Card>

        {/* Peak Hour */}
        <Card className="bg-zinc-900/30 border-zinc-800">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="flex items-center gap-2 text-xs">
                <Clock className="w-3.5 h-3.5" />
                Peak Hour
              </CardDescription>
              <Sparkline data={hourlyDistribution} color="#f59e0b" />
            </div>
            <CardTitle className="text-3xl font-bold tracking-tight">
              {peakHour !== null ? formatHourLabel(peakHour) : "N/A"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {previousPeakHour !== null && peakHour !== null && peakHour !== previousPeakHour ? (
              <span className="text-[11px] text-amber-500 flex items-center gap-1">
                <Activity className="w-3 h-3" />
                Shifted from {formatHourLabel(previousPeakHour)}
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Minus className="w-3 h-3" /> Consistent
              </span>
            )}
            <p className="text-[10px] text-muted-foreground mt-1.5 leading-tight">
              Most active check-in time
            </p>
          </CardContent>
        </Card>

        {/* Busiest Day */}
        <Card className="bg-zinc-900/30 border-zinc-800">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="flex items-center gap-2 text-xs">
                <Calendar className="w-3.5 h-3.5" />
                Busiest Day
              </CardDescription>
              <MiniBarChart data={weeklyBreakdown} />
            </div>
            <CardTitle className="text-3xl font-bold tracking-tight">
              {busiestDay !== null ? DAY_SHORT[busiestDay] : "N/A"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <span className="text-[11px] text-emerald-500">
              {busiestDay !== null ? DAY_NAMES[busiestDay] : ""}
            </span>
            <p className="text-[10px] text-muted-foreground mt-1.5 leading-tight">
              Highest traffic day of the week
            </p>
          </CardContent>
        </Card>

        {/* Quietest Hour */}
        <Card className="bg-zinc-900/30 border-zinc-800">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="flex items-center gap-2 text-xs">
                <Moon className="w-3.5 h-3.5" />
                Quietest Hour
              </CardDescription>
            </div>
            <CardTitle className="text-3xl font-bold tracking-tight">
              {quietestHour !== null ? formatHourLabel(quietestHour) : "N/A"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <span className="text-[11px] text-blue-400">
              Best for maintenance
            </span>
            <p className="text-[10px] text-muted-foreground mt-1.5 leading-tight">
              Lowest traffic hour (5AM-11PM)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Stats - 3 columns */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* This Month */}
        <Card className="bg-zinc-900/20 border-zinc-800/50">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <div>
                <CardDescription className="text-xs">This Month</CardDescription>
                <CardTitle className="text-2xl font-bold">{thisMonthCount}</CardTitle>
              </div>
              <TrendIndicator current={thisMonthCount} previous={lastMonthCount} suffix="vs last month" />
            </div>
          </CardHeader>
        </Card>

        {/* Daily Average */}
        <Card className="bg-zinc-900/20 border-zinc-800/50">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <div>
                <CardDescription className="text-xs">Daily Average</CardDescription>
                <CardTitle className="text-2xl font-bold">{avgDailyCheckIns}</CardTitle>
              </div>
              <span className="text-[11px] text-muted-foreground">Last 30 days</span>
            </div>
          </CardHeader>
        </Card>

        {/* Today */}
        <Card className="bg-zinc-900/20 border-zinc-800/50">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <div>
                <CardDescription className="text-xs">Today</CardDescription>
                <CardTitle className="text-2xl font-bold">{todayCount}</CardTitle>
              </div>
              <TrendIndicator current={todayCount} previous={yesterdayCount} suffix="vs yesterday" />
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Contribution Calendar */}
      <Card className="border-zinc-800">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle>Gym Activity</CardTitle>
            <CardDescription>
              {yearlyTotal} check-ins in {selectedYear}
            </CardDescription>
          </div>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="border border-zinc-700 rounded px-3 py-1.5 bg-zinc-800 text-sm"
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto pb-2">
            <div className="flex ml-10 mb-2 min-w-fit">
              {monthLabels.map(({ label, weekIndex }, i) => (
                <div
                  key={i}
                  className="text-xs text-muted-foreground"
                  style={{
                    position: "relative",
                    left: `${weekIndex * 14}px`,
                  }}
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="flex gap-1 min-w-fit">
              <div className="flex flex-col gap-[3px] mr-2 text-xs text-muted-foreground">
                <div className="h-[10px]"></div>
                <div className="h-[10px] leading-[10px]">Mon</div>
                <div className="h-[10px]"></div>
                <div className="h-[10px] leading-[10px]">Wed</div>
                <div className="h-[10px]"></div>
                <div className="h-[10px] leading-[10px]">Fri</div>
                <div className="h-[10px]"></div>
              </div>

              <div className="flex gap-[3px]">
                {weeks.map((week, weekIndex) => (
                  <div key={weekIndex} className="flex flex-col gap-[3px]">
                    {week.map((day, dayIndex) => {
                      const isOutsideYear = day.count === -1
                      const isFuture = isAfter(day.date, new Date())

                      return (
                        <div
                          key={dayIndex}
                          className={`w-[10px] h-[10px] rounded-sm transition-colors ${
                            isOutsideYear || isFuture
                              ? "bg-transparent"
                              : getContributionColor(day.count, maxDayCount)
                          }`}
                          onMouseEnter={() => !isOutsideYear && !isFuture && setHoveredDay(day)}
                          onMouseLeave={() => setHoveredDay(null)}
                          title={
                            isOutsideYear || isFuture
                              ? ""
                              : `${format(day.date, "MMM d, yyyy")}: ${day.count} check-in${day.count !== 1 ? "s" : ""}`
                          }
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
              <span>Less</span>
              <div className={`w-[10px] h-[10px] rounded-sm ${CONTRIBUTION_COLORS.empty}`} />
              <div className={`w-[10px] h-[10px] rounded-sm ${CONTRIBUTION_COLORS.level1}`} />
              <div className={`w-[10px] h-[10px] rounded-sm ${CONTRIBUTION_COLORS.level2}`} />
              <div className={`w-[10px] h-[10px] rounded-sm ${CONTRIBUTION_COLORS.level3}`} />
              <div className={`w-[10px] h-[10px] rounded-sm ${CONTRIBUTION_COLORS.level4}`} />
              <span>More</span>
            </div>

            {hoveredDay && (
              <div className="mt-2 text-sm">
                <span className="font-medium">{format(hoveredDay.date, "EEEE, MMMM d, yyyy")}</span>
                <span className="text-muted-foreground">
                  {" "}— {hoveredDay.count} check-in{hoveredDay.count !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Line Graph */}
      <Card className="border-zinc-800">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Active Sessions by Day and Time</CardTitle>
            <CardDescription>Each line represents a 2-hour pair.</CardDescription>
          </div>

          <div className="mt-4 md:mt-0 flex items-center space-x-2">
            <label htmlFor="monthPicker" className="text-sm text-muted-foreground whitespace-nowrap">
              Month:
            </label>
            <select
              id="monthPicker"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="border border-zinc-700 rounded px-2 py-1 bg-zinc-800 text-sm"
            >
              {last12Months.map(({ key, label }) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>

        <CardContent className="h-[450px] flex flex-col md:flex-row">
          <ResponsiveContainer width="100%" height={400} minWidth={0} minHeight={0}>
            <LineChart data={lineData} margin={{ top: 30, right: 40, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="day"
                label={{ value: "Day of Week", position: "bottom", offset: 20 }}
                tick={{ fontSize: 12 }}
                stroke="#71717a"
              />
              <YAxis
                label={{
                  value: "Active Users",
                  angle: -90,
                  position: "insideLeft",
                  offset: 10,
                }}
                allowDecimals={false}
                tick={{ fontSize: 12 }}
                domain={[0, "dataMax"]}
                stroke="#71717a"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  borderRadius: 8,
                  border: "1px solid #27272a",
                }}
                formatter={(value: number, name: string) => [value, name]}
                labelStyle={{ fontWeight: 600 }}
              />

              {TIME_PAIRS.map(({ label }, index) => (
                <Line
                  key={label}
                  type="monotone"
                  dataKey={label}
                  stroke={colors[index % colors.length]}
                  strokeWidth={2}
                  dot={false}
                  name={label}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>

          <div className="w-full md:w-[15%] mt-4 md:mt-0 md:ml-4 flex flex-col">
            <button
              className="mb-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 transition"
              onClick={() => setLegendOpen((prev) => !prev)}
            >
              {legendOpen ? "Hide Legend" : "Show Legend"}
            </button>

            {legendOpen && (
              <div
                className="overflow-y-auto border border-zinc-700 rounded p-2 max-h-[350px]"
                style={{ scrollbarWidth: "thin" }}
              >
                {TIME_PAIRS.map(({ label }, index) => (
                  <div key={label} className="flex items-center mb-2">
                    <div
                      className="w-4 h-4 rounded mr-2 flex-shrink-0"
                      style={{ backgroundColor: colors[index % colors.length] }}
                    />
                    <span className="text-xs">{label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Monthly Trend */}
      <Card className="border-zinc-800">
        <CardHeader>
          <CardTitle>Monthly Check-ins</CardTitle>
          <CardDescription>Last 12 months trend</CardDescription>
        </CardHeader>
        <CardContent className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="month" stroke="#71717a" tick={{ fontSize: 12 }} />
              <YAxis stroke="#71717a" tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  borderRadius: 8,
                  border: "1px solid #27272a",
                }}
              />
              <Line
                type="monotone"
                dataKey="checkIns"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ fill: "#10b981", r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}