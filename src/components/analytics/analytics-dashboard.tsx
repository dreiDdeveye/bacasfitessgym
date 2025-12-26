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
import { getDay, getHours, format, subMonths } from "date-fns"
import type { ScanLog } from "@/src/types"
import { storageService } from "@/src/services/storage.service"

interface HeatmapCell {
  day: number // 0–6 (Sun–Sat)
  hour: number // 0–23
  count: number
}

interface MonthlyData {
  month: string
  checkIns: number
}

interface TimePair {
  label: string
  start: number
  end: number
}

// Define pairs of 1-hour intervals (odd hour to next even hour)
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

// Generate last 12 months keys and labels for picker
const last12Months = Array.from({ length: 12 }, (_, i) => {
  const date = subMonths(new Date(), 11 - i)
  return { key: format(date, "yyyy-MM"), label: format(date, "MMM yyyy") }
})

// Helper to convert 0-23 hour to 12-hour format with AM/PM
function formatHourLabel(hour24: number): string {
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  const ampm = hour24 < 12 ? "AM" : "PM"
  return `${hour12} ${ampm}`
}

// Color palette
const colors = [
  "#4f46e5",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#ec4899",
  "#22d3ee",
  "#f97316",
  "#a855f7",
  "#14b8a6",
  "#f43f5e",
  "#8b5cf6",
]

export function AnalyticsDashboard() {
  // State declarations
  const [heatmapData, setHeatmapData] = useState<HeatmapCell[]>([])
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([])
  const [totalCheckIns, setTotalCheckIns] = useState(0)
  const [peakHour, setPeakHour] = useState<number | null>(null)
  const [lineData, setLineData] = useState<any[]>([])
  const [legendOpen, setLegendOpen] = useState<boolean>(false)
  const [selectedMonth, setSelectedMonth] = useState<string>(last12Months[11].key)
  const [allValidLogs, setAllValidLogs] = useState<ScanLog[]>([])

  useEffect(() => {
    loadAnalytics()
  }, [])

  useEffect(() => {
    if (allValidLogs.length) {
      updateLineDataForMonth(selectedMonth)
    }
  }, [allValidLogs, selectedMonth])

  async function loadAnalytics() {
    const logs = await storageService.getScanLogs()
    const validLogs = logs.filter(
      (l) => l.action === "check-in" && l.status === "success"
    )
    setAllValidLogs(validLogs)
    setTotalCheckIns(validLogs.length)

    // Heatmap data
    const heatmap: HeatmapCell[] = []
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        heatmap.push({ day, hour, count: 0 })
      }
    }
    validLogs.forEach((log) => {
      const date = new Date(log.timestamp)
      if (isNaN(date.getTime())) return
      const day = getDay(date)
      const hour = getHours(date)
      const cell = heatmap.find((h) => h.day === day && h.hour === hour)
      if (cell) cell.count++
    })
    setHeatmapData(heatmap)

    // Peak hour
    const hourMap = new Map<number, number>()
    validLogs.forEach((log) => {
      const date = new Date(log.timestamp)
      if (isNaN(date.getTime())) return
      const hour = getHours(date)
      hourMap.set(hour, (hourMap.get(hour) || 0) + 1)
    })
    let maxHour: number | null = null
    let maxCount = 0
    hourMap.forEach((count, hour) => {
      if (count > maxCount) {
        maxCount = count
        maxHour = hour
      }
    })
    setPeakHour(maxHour)

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

  function updateLineDataForMonth(monthKey: string) {
    const filteredLogs = allValidLogs.filter(
      (log) => format(new Date(log.timestamp), "yyyy-MM") === monthKey
    )
    const data: any[] = []
    for (let day = 0; day < 7; day++) {
      const dayLabel = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]
      const obj: any = { day: dayLabel }
      TIME_PAIRS.forEach(({ label, start, end }) => {
        const count = filteredLogs.filter((log) => {
          const date = new Date(log.timestamp)
          const hour = getHours(date)
          // Normalize hour 0 to 24 to match labels
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

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardDescription>Total Check-ins</CardDescription>
            <CardTitle className="text-3xl">{totalCheckIns}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Peak Hour</CardDescription>
            <CardTitle className="text-3xl">
              {peakHour !== null ? `${formatHourLabel(peakHour)} ` : "N/A"}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>This Month</CardDescription>
            <CardTitle className="text-3xl">
              {heatmapData.reduce((sum, d) => sum + d.count, 0)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Heatmap Card */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Heatmap</CardTitle>
          <CardDescription>Check-ins by day & Time</CardDescription>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            {/* Hour labels */}
            <div className="flex mb-2 ml-20">
              {[...Array(24)].map((_, i) => {
                const hour24 = (i + 1) % 24
                const displayHour = hour24 === 0 ? 24 : hour24

                // For display, treat 24 as 0 (midnight)
                const hourForLabel = displayHour === 24 ? 0 : displayHour

                const hour12 = hourForLabel % 12 === 0 ? 12 : hourForLabel % 12
                const ampm = hourForLabel < 12 ? "AM" : "PM"

                return (
                  <div
                    key={i}
                    className="w-9 mx-[3px] text-center select-none text-muted-foreground"
                    title={`${hour12} ${ampm}`}
                  >
                    <div className="text-xs font-semibold">{hour12}</div>
                    <div className="text-[10px]">{ampm}</div>
                  </div>
                )
              })}
            </div>

            {/* Days and heatmap cells */}
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
              (day, dayIndex) => (
                <div key={dayIndex} className="flex items-center mb-2">
                  <div className="w-20 text-sm font-medium select-none">{day}</div>

                  <div className="flex overflow-x-auto">
                    {[...Array(24)].map((_, i) => {
                      const hour24 = (i + 1) % 24
                      const displayHour = hour24 === 0 ? 24 : hour24

                      // For tooltip, treat 24 as 0
                      const hourForLabel = displayHour === 24 ? 0 : displayHour

                      const hour12 = hourForLabel % 12 === 0 ? 12 : hourForLabel % 12
                      const ampm = hourForLabel < 12 ? "AM" : "PM"

                      const cell = heatmapData.find(
                        (d) =>
                          d.day === dayIndex &&
                          d.hour === hourForLabel
                      )

                      const maxHeat = Math.max(
                        ...heatmapData.map((d) => d.count),
                        1
                      )

                      const heatColor = (count: number) => {
                        if (count === 0) return "bg-gray-100"
                        const pct = count / maxHeat
                        if (pct < 0.25) return "bg-indigo-200"
                        if (pct < 0.5) return "bg-indigo-400"
                        if (pct < 0.75) return "bg-indigo-600"
                        return "bg-indigo-800"
                      }

                      return (
                        <div
                          key={i}
                          className={`w-9 h-9 mx-[3px] rounded-md transition-colors cursor-default ${heatColor(
                            cell?.count || 0
                          )}`}
                          title={`${day} ${hour12} ${ampm} → ${
                            cell?.count || 0
                          } check-ins`}
                        />
                      )
                    })}
                  </div>
                </div>
              )
            )}
          </div>
        </CardContent>
      </Card>

      {/* Line Graph with Month Picker and Legend */}
      <Card>
        <CardHeader>
          <CardTitle>Active Sessions by Day and Time Pair</CardTitle>
          <CardDescription>
            Each line represents a 2-hour pair.
          </CardDescription>
          <div className="mt-4">
            <label htmlFor="monthPicker" className="mr-2 font-semibold">
              Select Month:
            </label>
            <select
              id="monthPicker"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="border rounded p-1"
            >
              {last12Months.map(({ key, label }) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent className="h-[450px] flex">
          <ResponsiveContainer width="85%" height="100%">
            <LineChart
              data={lineData}
              margin={{ top: 30, right: 40, left: 40, bottom: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="day"
                label={{ value: "Day of Week", position: "bottom", offset: 20 }}
                tick={{ fontSize: 14, fontWeight: 600 }}
              />
              <YAxis
                label={{
                  value: "Active Users",
                  angle: -90,
                  position: "insideLeft",
                  offset: 10,
                  fontWeight: 600,
                }}
                allowDecimals={false}
                tick={{ fontSize: 14 }}
                domain={[0, "dataMax"]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fff",
                  borderRadius: 8,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                }}
                formatter={(value: number, name: string) => [value, name]}
                labelStyle={{ fontWeight: 700 }}
              />

              {/* Lines */}
              {TIME_PAIRS.map(({ label }, index) => (
                <Line
                  key={label}
                  type="monotone"
                  dataKey={label}
                  stroke={colors[index % colors.length]}
                  strokeWidth={2}
                  dot={false}
                  name={label}
                  activeDot={{ r: 6 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>

          {/* Legend dropdown */}
          <div className="w-[15%] ml-4 flex flex-col">
            <button
              className="mb-2 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition"
              onClick={() => setLegendOpen((prev: boolean) => !prev)}
            >
              {legendOpen ? "Hide Legend" : "Show Legend"}
            </button>

            {legendOpen && (
              <div
                className="overflow-y-auto border border-gray-300 rounded p-2 max-h-[400px]"
                style={{ scrollbarWidth: "thin" }}
              >
                {TIME_PAIRS.map(({ label }, index) => (
                  <div key={label} className="flex items-center mb-2">
                    <div
                      className="w-5 h-5 rounded mr-2"
                      style={{ backgroundColor: colors[index % colors.length] }}
                    />
                    <span className="text-sm">{label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Monthly Trend */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Check-ins</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="checkIns"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
