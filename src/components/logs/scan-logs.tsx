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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LogIn, LogOut, AlertCircle, Calendar, Filter, Search, Download, FileText, FileSpreadsheet, X } from "lucide-react"
import type { ScanLog } from "@/src/types"
import { storageService } from "@/src/services/storage.service"

type FilterMode = "today" | "date" | "month" | "all"

// ─── Download scope options ───────────────────────────────────────────────────
type DownloadScope =
  | "current_filter"   // whatever is currently shown
  | "today"
  | "specific_date"
  | "month_year"
  | "all"
  | "by_name"
  | "checkins_all"
  | "checkouts_all"
  | "expired_all"
  | "active_all"
  | "monthly_inout"
  | "weekly_inout"
  | "daily_inout"
  | "walkin_inout"
  | "per_member_summary"
  | "member_hours"

const DOWNLOAD_OPTIONS: { value: DownloadScope; label: string; description: string; group: string }[] = [
  // Date Range — A→Z
  { value: "all",            label: "All Logs",      description: "Every scan in the database",            group: "Date Range" },
  { value: "current_filter", label: "Current View",  description: "Export exactly what's shown on screen", group: "Date Range" },
  { value: "month_year",     label: "Month & Year",  description: "All scans from a selected month",       group: "Date Range" },
  { value: "specific_date",  label: "Specific Date", description: "Pick a single date to export",          group: "Date Range" },
  { value: "today",          label: "Today",         description: "All scans from today",                  group: "Date Range" },
  // By Member — A→Z
  { value: "by_name",           label: "By Name / ID",        description: "Search and export a specific member",                     group: "By Member" },
  { value: "member_hours",      label: "Member Total Hours",  description: "Each member's gym hours: today, week, month & all-time",  group: "By Member" },
  { value: "per_member_summary",label: "Per Member Summary",  description: "Each member's check-ins, check-outs, invalid & expired", group: "By Member" },
  // By Action — A→Z
  { value: "active_all",    label: "Active / Success Scans", description: "Successful scan records only",         group: "By Action" },
  { value: "checkins_all",  label: "Check-ins (All)",        description: "All check-in records",                 group: "By Action" },
  { value: "checkouts_all", label: "Check-outs (All)",       description: "All check-out records",                group: "By Action" },
  { value: "expired_all",   label: "Expired Scans",          description: "Scans rejected as expired",            group: "By Action" },
  // By Period — A→Z
  { value: "daily_inout",   label: "Daily Check-ins/outs",   description: "In/out summary grouped by day",        group: "By Period" },
  { value: "monthly_inout", label: "Monthly Check-ins/outs", description: "In/out summary grouped by month",      group: "By Period" },
  { value: "walkin_inout",  label: "Walk-in Check-ins/outs", description: "Records matching walk-in membership",  group: "By Period" },
  { value: "weekly_inout",  label: "Weekly Check-ins/outs",  description: "In/out summary grouped by week",       group: "By Period" },
]

const MONTHS = [
  { value: "0",  label: "January" },
  { value: "1",  label: "February" },
  { value: "2",  label: "March" },
  { value: "3",  label: "April" },
  { value: "4",  label: "May" },
  { value: "5",  label: "June" },
  { value: "6",  label: "July" },
  { value: "7",  label: "August" },
  { value: "8",  label: "September" },
  { value: "9",  label: "October" },
  { value: "10", label: "November" },
  { value: "11", label: "December" },
]

const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: 6 }, (_, i) => ({
  value: String(currentYear - i),
  label: String(currentYear - i),
}))

/* ─── Format helpers ──────────────────────────────────────────────────────── */

function phDate(ts: string) {
  return new Date(ts).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })
}
function phObj(ts: string) {
  return new Date(new Date(ts).toLocaleString("en-US", { timeZone: "Asia/Manila" }))
}
function weekLabel(ts: string) {
  const d = phObj(ts)
  const day = d.getDay()
  const mon = new Date(d); mon.setDate(d.getDate() - day)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  const fmt = (x: Date) => x.toLocaleDateString("en-PH", { month: "short", day: "numeric" })
  return `${fmt(mon)} – ${fmt(sun)}, ${mon.getFullYear()}`
}

function formatRow(log: ScanLog) {
  const d = new Date(log.timestamp)
  return {
    "Date":      d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric" }),
    "Time":      d.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    "Member ID": log.userId,
    "Name":      log.userName,
    "Action":    log.action === "check-in" ? "Check In" : log.action === "check-out" ? "Check Out" : "N/A",
    "Status":    log.status.charAt(0).toUpperCase() + log.status.slice(1),
  }
}

function formatSummaryRow(key: string, checkIns: number, checkOuts: number, invalid: number, expired: number) {
  return {
    "Period":      key,
    "Check-ins":   checkIns,
    "Check-outs":  checkOuts,
    "Total":       checkIns + checkOuts,
    "Invalid":     invalid,
    "Expired":     expired,
  }
}

/* ─── Apply scope filter ──────────────────────────────────────────────────── */

// Sort raw log rows alphabetically by Name then by Date+Time
function sortRows(rows: Record<string, any>[]) {
  return rows.sort((a, b) => {
    const nameCmp = String(a["Name"] ?? "").localeCompare(String(b["Name"] ?? ""))
    if (nameCmp !== 0) return nameCmp
    return String(a["Date"] ?? "").localeCompare(String(b["Date"] ?? ""))
  })
}

function msToHours(ms: number) {
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function applyScope(
  allLogs: ScanLog[],
  scope: DownloadScope,
  opts: {
    exportDate: string
    exportMonth: string
    exportYear: string
    exportName: string
    currentFiltered: ScanLog[]
  }
): { rows: Record<string, any>[]; filename: string } {
  const { exportDate, exportMonth, exportYear, exportName, currentFiltered } = opts

  switch (scope) {
    case "current_filter":
      return { rows: sortRows(currentFiltered.map(formatRow)), filename: "scan-logs-current-view" }

    case "today": {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })
      return {
        rows: sortRows(allLogs.filter(l => phDate(l.timestamp) === today).map(formatRow)),
        filename: `scan-logs-today-${today}`,
      }
    }

    case "specific_date":
      return {
        rows: sortRows(allLogs.filter(l => phDate(l.timestamp) === exportDate).map(formatRow)),
        filename: `scan-logs-${exportDate}`,
      }

    case "month_year": {
      const m = parseInt(exportMonth), y = parseInt(exportYear)
      return {
        rows: sortRows(allLogs.filter(l => { const d = phObj(l.timestamp); return d.getMonth() === m && d.getFullYear() === y }).map(formatRow)),
        filename: `scan-logs-${MONTHS[m].label.toLowerCase()}-${y}`,
      }
    }

    case "all":
      return { rows: sortRows(allLogs.map(formatRow)), filename: "scan-logs-all" }

    case "by_name": {
      const term = exportName.toLowerCase()
      return {
        rows: sortRows(allLogs.filter(l => l.userName.toLowerCase().includes(term) || l.userId.toLowerCase().includes(term)).map(formatRow)),
        filename: `scan-logs-member-${exportName.replace(/\s+/g, "-").toLowerCase()}`,
      }
    }

    case "checkins_all":
      return { rows: sortRows(allLogs.filter(l => l.action === "check-in").map(formatRow)),  filename: "scan-logs-checkins-all" }

    case "checkouts_all":
      return { rows: sortRows(allLogs.filter(l => l.action === "check-out").map(formatRow)), filename: "scan-logs-checkouts-all" }

    case "expired_all":
      return { rows: sortRows(allLogs.filter(l => l.status === "expired").map(formatRow)),   filename: "scan-logs-expired-all" }

    case "active_all":
      return { rows: sortRows(allLogs.filter(l => l.status === "success").map(formatRow)),   filename: "scan-logs-active-all" }

    case "monthly_inout": {
      const map: Record<string, { in: number; out: number; invalid: number; expired: number }> = {}
      allLogs.forEach(l => {
        const d = phObj(l.timestamp)
        const key = `${MONTHS[d.getMonth()].label} ${d.getFullYear()}`
        if (!map[key]) map[key] = { in: 0, out: 0, invalid: 0, expired: 0 }
        if (l.action === "check-in"  && l.status === "success") map[key].in++
        if (l.action === "check-out" && l.status === "success") map[key].out++
        if (l.status === "invalid") map[key].invalid++
        if (l.status === "expired") map[key].expired++
      })
      return {
        rows: Object.entries(map)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => formatSummaryRow(k, v.in, v.out, v.invalid, v.expired)),
        filename: "scan-logs-monthly-summary",
      }
    }

    case "weekly_inout": {
      const map: Record<string, { in: number; out: number; invalid: number; expired: number }> = {}
      allLogs.forEach(l => {
        const key = weekLabel(l.timestamp)
        if (!map[key]) map[key] = { in: 0, out: 0, invalid: 0, expired: 0 }
        if (l.action === "check-in"  && l.status === "success") map[key].in++
        if (l.action === "check-out" && l.status === "success") map[key].out++
        if (l.status === "invalid") map[key].invalid++
        if (l.status === "expired") map[key].expired++
      })
      return {
        rows: Object.entries(map)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => formatSummaryRow(k, v.in, v.out, v.invalid, v.expired)),
        filename: "scan-logs-weekly-summary",
      }
    }

    case "daily_inout": {
      const map: Record<string, { in: number; out: number; invalid: number; expired: number }> = {}
      allLogs.forEach(l => {
        const key = new Date(l.timestamp).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "short", year: "numeric", month: "short", day: "numeric" })
        if (!map[key]) map[key] = { in: 0, out: 0, invalid: 0, expired: 0 }
        if (l.action === "check-in"  && l.status === "success") map[key].in++
        if (l.action === "check-out" && l.status === "success") map[key].out++
        if (l.status === "invalid") map[key].invalid++
        if (l.status === "expired") map[key].expired++
      })
      return {
        rows: Object.entries(map)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => formatSummaryRow(k, v.in, v.out, v.invalid, v.expired)),
        filename: "scan-logs-daily-summary",
      }
    }

    case "walkin_inout":
      return {
        rows: sortRows(allLogs.filter(l => l.action === "check-in" || l.action === "check-out").map(formatRow)),
        filename: "scan-logs-walkin",
      }

    case "per_member_summary": {
      const map: Record<string, {
        name: string; userId: string
        checkIns: number; checkOuts: number; invalid: number; expired: number
      }> = {}
      allLogs.forEach(l => {
        if (!map[l.userId]) map[l.userId] = { name: l.userName, userId: l.userId, checkIns: 0, checkOuts: 0, invalid: 0, expired: 0 }
        if (l.action === "check-in"  && l.status === "success") map[l.userId].checkIns++
        if (l.action === "check-out" && l.status === "success") map[l.userId].checkOuts++
        if (l.status === "invalid") map[l.userId].invalid++
        if (l.status === "expired") map[l.userId].expired++
      })
      return {
        rows: Object.values(map)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(m => ({
            "Member ID":   m.userId,
            "Name":        m.name,
            "Check-ins":   m.checkIns,
            "Check-outs":  m.checkOuts,
            "Total Scans": m.checkIns + m.checkOuts + m.invalid + m.expired,
            "Invalid":     m.invalid,
            "Expired":     m.expired,
          })),
        filename: "scan-logs-per-member-summary",
      }
    }

    case "member_hours": {
      // Build per-member check-in/out pairs to compute gym hours
      const memberMap: Record<string, { name: string; logs: ScanLog[] }> = {}
      allLogs.forEach(l => {
        if (!memberMap[l.userId]) memberMap[l.userId] = { name: l.userName, logs: [] }
        memberMap[l.userId].logs.push(l)
      })

      const now     = new Date()
      const nowPH   = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }))
      const todayStr = nowPH.toLocaleDateString("en-CA")
      const weekStart = new Date(nowPH); weekStart.setDate(nowPH.getDate() - nowPH.getDay()); weekStart.setHours(0,0,0,0)
      const monthStart = new Date(nowPH.getFullYear(), nowPH.getMonth(), 1)

      const calcHours = (logs: ScanLog[], from: Date | null): number => {
        const sorted = [...logs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        let total = 0, lastIn: Date | null = null
        for (const l of sorted) {
          const t = new Date(l.timestamp)
          if (from && t < from) continue
          if (l.action === "check-in")  lastIn = t
          if (l.action === "check-out" && lastIn) { total += t.getTime() - lastIn.getTime(); lastIn = null }
        }
        return total
      }

      return {
        rows: Object.values(memberMap)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(m => {
            const todayLogs = m.logs.filter(l => phDate(l.timestamp) === todayStr)
            return {
              "Member ID":        m.logs[0]?.userId ?? "",
              "Name":             m.name,
              "Today":            msToHours(calcHours(todayLogs, null)),
              "This Week":        msToHours(calcHours(m.logs, weekStart)),
              "This Month":       msToHours(calcHours(m.logs, monthStart)),
              "All-time":         msToHours(calcHours(m.logs, null)),
            }
          }),
        filename: "scan-logs-member-hours",
      }
    }

    default:
      return { rows: [], filename: "scan-logs" }
  }
}

/* ─── File writers ────────────────────────────────────────────────────────── */

function writeCSV(rows: Record<string, any>[], filename: string) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const escape  = (v: string) => v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v
  const csv = [headers.join(","), ...rows.map(r => headers.map(h => escape(String(r[h] ?? ""))).join(","))].join("\n")
  const a   = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" })),
    download: `${filename}.csv`,
  })
  a.click()
}

async function writeExcel(rows: Record<string, any>[], filename: string) {
  try {
    const XLSX = await import("xlsx")
    const ws   = XLSX.utils.json_to_sheet(rows)
    ws["!cols"] = Object.keys(rows[0] || {}).map(k => ({
      wch: Math.max(k.length, ...rows.map(r => String(r[k] ?? "").length)) + 2,
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Scan Logs")
    XLSX.writeFile(wb, `${filename}.xlsx`)
  } catch {
    writeCSV(rows, filename)
    alert("Excel export unavailable — downloaded as CSV.\nRun: npm install xlsx to enable.")
  }
}

/* ═══════════════════════════════════════════════════════════════════════════ */

export function ScanLogs() {
  const [logs, setLogs]                   = useState<ScanLog[]>([])
  const [filteredLogs, setFilteredLogs]   = useState<ScanLog[]>([])
  const [filterMode, setFilterMode]       = useState<FilterMode>("today")
  const [searchTerm, setSearchTerm]       = useState("")
  const [selectedDate, setSelectedDate]   = useState<string>(new Date().toISOString().split("T")[0])
  const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth()))
  const [selectedYear, setSelectedYear]   = useState<string>(String(new Date().getFullYear()))
  const [isLoading, setIsLoading]         = useState(false)

  // Download dialog state
  const [showDownloadDialog, setShowDownloadDialog] = useState(false)
  const [downloadScope, setDownloadScope]           = useState<DownloadScope>("current_filter")
  const [exportDate, setExportDate]                 = useState(new Date().toISOString().split("T")[0])
  const [exportMonth, setExportMonth]               = useState(String(new Date().getMonth()))
  const [exportYear, setExportYear]                 = useState(String(new Date().getFullYear()))
  const [exportName, setExportName]                 = useState("")
  const [isDownloading, setIsDownloading]           = useState(false)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setLogs(await storageService.getScanLogs())
      setIsLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (!logs.length) { setFilteredLogs([]); return }
    let filtered: ScanLog[] = []
    switch (filterMode) {
      case "today": {
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })
        filtered = logs.filter(l => phDate(l.timestamp) === today)
        break
      }
      case "date":
        filtered = logs.filter(l => phDate(l.timestamp) === selectedDate)
        break
      case "month": {
        const m = parseInt(selectedMonth), y = parseInt(selectedYear)
        filtered = logs.filter(l => { const d = phObj(l.timestamp); return d.getMonth() === m && d.getFullYear() === y })
        break
      }
      case "all":
      default:
        filtered = logs
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(l => l.userName.toLowerCase().includes(term) || l.userId.toLowerCase().includes(term))
    }
    setFilteredLogs(filtered)
  }, [filterMode, selectedDate, selectedMonth, selectedYear, logs, searchTerm])

  const handleDownload = async (format: "csv" | "xlsx") => {
    setIsDownloading(true)
    const { rows, filename } = applyScope(logs, downloadScope, {
      exportDate, exportMonth, exportYear, exportName, currentFiltered: filteredLogs,
    })
    if (!rows.length) {
      alert("No records found for this selection.")
      setIsDownloading(false)
      return
    }
    if (format === "csv") writeCSV(rows, filename)
    else await writeExcel(rows, filename)
    setIsDownloading(false)
    setShowDownloadDialog(false)
  }

  const getStatusBadge = (log: ScanLog) => {
    if (log.status === "success") return <Badge variant="default">Success</Badge>
    if (log.status === "expired") return <Badge variant="destructive">Expired</Badge>
    if (log.status === "invalid") return <Badge variant="secondary">Invalid</Badge>
    return <Badge variant="destructive">Not Applicable</Badge>
  }

  const getActionIcon = (action: string) => {
    if (action === "check-in")  return <LogIn className="w-4 h-4" />
    if (action === "check-out") return <LogOut className="w-4 h-4" />
    return <AlertCircle className="w-4 h-4" />
  }

  const formatTimestamp = (timestamp: string) => {
    const d = new Date(timestamp)
    if (filterMode === "today" || filterMode === "date")
      return d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" })
    return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" })
  }

  const getFilterDescription = () => {
    let desc = ""
    switch (filterMode) {
      case "today": desc = `Today (${new Date().toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })})`; break
      case "date":  desc = new Date(selectedDate).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" }); break
      case "month": desc = `${MONTHS[parseInt(selectedMonth)].label} ${selectedYear}`; break
      case "all":   desc = `All Logs (${logs.length} total)`; break
    }
    if (searchTerm.trim()) desc += ` • Searching: "${searchTerm}"`
    return desc
  }

  // Group options for rendering
  const groups = [...new Set(DOWNLOAD_OPTIONS.map(o => o.group))]

  return (
    <div className="space-y-4">
      {/* Filter Controls */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium">Filter Logs</span>
        </div>
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by name or ID..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          <Button variant={filterMode === "today" ? "default" : "outline"} size="sm" onClick={() => setFilterMode("today")}>
            <Calendar className="w-4 h-4 mr-2" />Today
          </Button>
          <Button variant={filterMode === "date"  ? "default" : "outline"} size="sm" onClick={() => setFilterMode("date")}>Specific Date</Button>
          <Button variant={filterMode === "month" ? "default" : "outline"} size="sm" onClick={() => setFilterMode("month")}>Month & Year</Button>
          <Button variant={filterMode === "all"   ? "default" : "outline"} size="sm" onClick={() => setFilterMode("all")}>All Logs</Button>
        </div>
        {filterMode === "date" && (
          <div className="space-y-2">
            <Label htmlFor="date-picker">Select Date</Label>
            <Input id="date-picker" type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-48" />
          </div>
        )}
        {filterMode === "month" && (
          <div className="flex items-end gap-4">
            <div className="space-y-2">
              <Label>Month</Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>{MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Year</Label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>{YEARS.map(y => <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        )}
      </Card>

      {/* Results Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 md:gap-3">
        <div className="min-w-0">
          <h2 className="text-lg md:text-xl font-semibold">Scan History</h2>
          <p className="text-xs md:text-sm text-muted-foreground truncate">{getFilterDescription()}</p>
        </div>
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <Badge variant="outline" className="text-xs md:text-sm">
            {filteredLogs.length} {filteredLogs.length === 1 ? "record" : "records"}
          </Badge>
          <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={() => setShowDownloadDialog(true)}>
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Download</span>
          </Button>
        </div>
      </div>

      {/* ═══════════ DOWNLOAD DIALOG ═══════════ */}
      <Dialog open={showDownloadDialog} onOpenChange={setShowDownloadDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto w-[95vw] md:w-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              Download Scan Logs
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Scope selector — grouped */}
            <div>
              <Label className="text-sm font-semibold mb-3 block">What do you want to download?</Label>
              <div className="space-y-4">
                {groups.map(group => (
                  <div key={group}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{group}</p>
                    <div className="space-y-1">
                      {DOWNLOAD_OPTIONS.filter(o => o.group === group).map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setDownloadScope(opt.value)}
                          className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                            downloadScope === opt.value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-transparent hover:border-border hover:bg-muted"
                          }`}
                        >
                          <p className="text-sm font-medium">{opt.label}</p>
                          <p className="text-xs text-muted-foreground">{opt.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Extra inputs depending on scope */}
            {downloadScope === "specific_date" && (
              <div className="space-y-2 pt-1">
                <Label>Select Date</Label>
                <Input type="date" value={exportDate} onChange={e => setExportDate(e.target.value)} className="w-48" />
              </div>
            )}
            {downloadScope === "month_year" && (
              <div className="flex gap-3 pt-1">
                <div className="space-y-2 flex-1">
                  <Label>Month</Label>
                  <Select value={exportMonth} onValueChange={setExportMonth}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 w-28">
                  <Label>Year</Label>
                  <Select value={exportYear} onValueChange={setExportYear}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{YEARS.map(y => <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {downloadScope === "by_name" && (
              <div className="space-y-2 pt-1">
                <Label>Member Name or ID</Label>
                <Input placeholder="e.g. Juan dela Cruz or USR-001" value={exportName} onChange={e => setExportName(e.target.value)} />
              </div>
            )}

            {/* Format buttons */}
            <div className="border-t pt-4">
              <p className="text-sm font-semibold mb-3">Choose format</p>
              <div className="flex gap-3">
                <Button
                  className="flex-1 flex items-center gap-2"
                  variant="outline"
                  disabled={isDownloading}
                  onClick={() => handleDownload("csv")}
                >
                  <FileText className="w-4 h-4 text-green-600" />
                  CSV
                </Button>
                <Button
                  className="flex-1 flex items-center gap-2"
                  disabled={isDownloading}
                  onClick={() => handleDownload("xlsx")}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  {isDownloading ? "Downloading..." : "Excel (.xlsx)"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Logs List */}
      {isLoading ? (
        <Card className="p-12 text-center"><p className="text-muted-foreground">Loading logs...</p></Card>
      ) : filteredLogs.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="p-6 bg-muted rounded-full"><AlertCircle className="w-12 h-12 text-muted-foreground" /></div>
            <div>
              <h3 className="text-lg font-semibold">No Scan Logs</h3>
              <p className="text-sm text-muted-foreground mt-1">No scans found for the selected period</p>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredLogs.map(log => (
            <Card key={log.id} className="p-3 md:p-4">
              <div className="flex items-center gap-2 md:gap-4">
                <div className={`p-1.5 md:p-2 rounded-lg shrink-0 ${log.action === "check-in" ? "bg-primary/10" : log.action === "check-out" ? "bg-accent/10" : "bg-destructive/10"}`}>
                  {getActionIcon(log.action)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                    <span className="font-semibold truncate text-sm md:text-base">{log.userName}</span>
                    {getStatusBadge(log)}
                  </div>
                  <div className="flex items-center gap-2 md:gap-4 mt-1 text-xs md:text-sm text-muted-foreground">
                    <span className="font-mono truncate max-w-[100px] sm:max-w-none">{log.userId}</span>
                    <span className="shrink-0">{formatTimestamp(log.timestamp)}</span>
                  </div>
                </div>
                <Badge className="shrink-0 text-[10px] md:text-xs" variant={log.action === "check-in" ? "default" : log.action === "check-out" ? "secondary" : "destructive"}>
                  {log.action === "check-in" ? "In" : log.action === "check-out" ? "Out" : "N/A"}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}