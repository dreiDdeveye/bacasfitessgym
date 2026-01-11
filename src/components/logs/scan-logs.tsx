"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { LogIn, LogOut, AlertCircle, Calendar, Filter, Search } from "lucide-react"
import type { ScanLog } from "@/src/types"
import { storageService } from "@/src/services/storage.service"

type FilterMode = "today" | "date" | "month" | "all"

const MONTHS = [
  { value: "0", label: "January" },
  { value: "1", label: "February" },
  { value: "2", label: "March" },
  { value: "3", label: "April" },
  { value: "4", label: "May" },
  { value: "5", label: "June" },
  { value: "6", label: "July" },
  { value: "7", label: "August" },
  { value: "8", label: "September" },
  { value: "9", label: "October" },
  { value: "10", label: "November" },
  { value: "11", label: "December" },
]

// Generate year options (current year and 5 years back)
const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: 6 }, (_, i) => ({
  value: String(currentYear - i),
  label: String(currentYear - i),
}))

export function ScanLogs() {
  const [logs, setLogs] = useState<ScanLog[]>([])
  const [filteredLogs, setFilteredLogs] = useState<ScanLog[]>([])
  const [filterMode, setFilterMode] = useState<FilterMode>("today")
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  )
  const [selectedMonth, setSelectedMonth] = useState<string>(
    String(new Date().getMonth())
  )
  const [selectedYear, setSelectedYear] = useState<string>(
    String(new Date().getFullYear())
  )
  const [isLoading, setIsLoading] = useState(false)

  // Load all logs once
  const loadAllLogs = async () => {
    setIsLoading(true)
    const allLogs = await storageService.getScanLogs()
    setLogs(allLogs)
    setIsLoading(false)
  }

  useEffect(() => {
    loadAllLogs()
  }, [])

  // Filter logs based on selected mode and search term
  useEffect(() => {
    if (logs.length === 0) {
      setFilteredLogs([])
      return
    }

    let filtered: ScanLog[] = []

    switch (filterMode) {
      case "today": {
        const today = new Date().toISOString().split("T")[0]
        filtered = logs.filter((log) => {
          const logDate = new Date(log.timestamp).toISOString().split("T")[0]
          return logDate === today
        })
        break
      }

      case "date": {
        filtered = logs.filter((log) => {
          const logDate = new Date(log.timestamp).toISOString().split("T")[0]
          return logDate === selectedDate
        })
        break
      }

      case "month": {
        const month = parseInt(selectedMonth)
        const year = parseInt(selectedYear)
        filtered = logs.filter((log) => {
          const logDate = new Date(log.timestamp)
          return logDate.getMonth() === month && logDate.getFullYear() === year
        })
        break
      }

      case "all":
      default:
        filtered = logs.slice(0, 200) // Limit to last 200 logs
        break
    }

    // Apply search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(
        (log) =>
          log.userName.toLowerCase().includes(term) ||
          log.userId.toLowerCase().includes(term)
      )
    }

    setFilteredLogs(filtered)
  }, [filterMode, selectedDate, selectedMonth, selectedYear, logs, searchTerm])

  const getStatusBadge = (log: ScanLog) => {
    if (log.status === "success") {
      return <Badge variant="default">Success</Badge>
    } else if (log.status === "expired") {
      return <Badge variant="destructive">Expired</Badge>
    } else if (log.status === "invalid") {
      return <Badge variant="secondary">Invalid</Badge>
    } else {
      return <Badge variant="destructive">Not Applicable</Badge>
    }
  }

  const getActionIcon = (action: string) => {
    if (action === "check-in") return <LogIn className="w-4 h-4" />
    if (action === "check-out") return <LogOut className="w-4 h-4" />
    return <AlertCircle className="w-4 h-4" />
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    if (filterMode === "today" || filterMode === "date") {
      return date.toLocaleTimeString("en-PH", {
        hour: "2-digit",
        minute: "2-digit",
      })
    }
    return date.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getFilterDescription = () => {
    let desc = ""
    switch (filterMode) {
      case "today":
        desc = `Today (${new Date().toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })})`
        break
      case "date":
        desc = new Date(selectedDate).toLocaleDateString("en-PH", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })
        break
      case "month":
        desc = `${MONTHS[parseInt(selectedMonth)].label} ${selectedYear}`
        break
      case "all":
        desc = "All Logs (Last 200)"
        break
      default:
        desc = ""
    }
    
    if (searchTerm.trim()) {
      desc += ` • Searching: "${searchTerm}"`
    }
    
    return desc
  }

  return (
    <div className="space-y-4">
      {/* Filter Controls */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium">Filter Logs</span>
        </div>

        {/* Search Input */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Filter Mode Buttons */}
        <div className="flex flex-wrap gap-2 mb-4">
          <Button
            variant={filterMode === "today" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterMode("today")}
          >
            <Calendar className="w-4 h-4 mr-2" />
            Today
          </Button>
          <Button
            variant={filterMode === "date" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterMode("date")}
          >
            Specific Date
          </Button>
          <Button
            variant={filterMode === "month" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterMode("month")}
          >
            Month & Year
          </Button>
          <Button
            variant={filterMode === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterMode("all")}
          >
            All Logs
          </Button>
        </div>

        {/* Date Picker (for "date" mode) */}
        {filterMode === "date" && (
          <div className="flex items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="date-picker">Select Date</Label>
              <Input
                id="date-picker"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-48"
              />
            </div>
          </div>
        )}

        {/* Month & Year Selectors (for "month" mode) */}
        {filterMode === "month" && (
          <div className="flex items-end gap-4">
            <div className="space-y-2">
              <Label>Month</Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month) => (
                    <SelectItem key={month.value} value={month.value}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Year</Label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((year) => (
                    <SelectItem key={year.value} value={year.value}>
                      {year.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </Card>

      {/* Results Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Scan History</h2>
          <p className="text-sm text-muted-foreground">{getFilterDescription()}</p>
        </div>
        <Badge variant="outline" className="text-sm">
          {filteredLogs.length} {filteredLogs.length === 1 ? "record" : "records"}
        </Badge>
      </div>

      {/* Logs List */}
      {isLoading ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">Loading logs...</p>
        </Card>
      ) : filteredLogs.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="p-6 bg-muted rounded-full">
              <AlertCircle className="w-12 h-12 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">No Scan Logs</h3>
              <p className="text-sm text-muted-foreground mt-1">
                No scans found for the selected period
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredLogs.map((log) => (
            <Card key={log.id} className="p-4">
              <div className="flex items-center gap-4">
                <div
                  className={`p-2 rounded-lg ${
                    log.action === "check-in"
                      ? "bg-primary/10"
                      : log.action === "check-out"
                        ? "bg-accent/10"
                        : "bg-destructive/10"
                  }`}
                >
                  {getActionIcon(log.action)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold truncate">{log.userName}</span>
                    {getStatusBadge(log)}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                    <span className="font-mono">{log.userId}</span>
                    <span>{formatTimestamp(log.timestamp)}</span>
                  </div>
                </div>

                <Badge
                  variant={
                    log.action === "check-in"
                      ? "default"
                      : log.action === "check-out"
                        ? "secondary"
                        : "destructive"
                  }
                >
                  {log.action === "check-in"
                    ? "Check In"
                    : log.action === "check-out"
                      ? "Check Out"
                      : "Not Applicable"}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}