"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  HardDriveDownload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  Clock,
  Timer,
  RefreshCw,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import {
  backupToGoogleSheets,
  getLastBackup,
  isAutoBackupEnabled,
  setAutoBackupEnabled,
  getAutoBackupStatus,
  getSpreadsheetUrl,
  type BackupProgress,
  type AutoBackupStatus,
} from "@/src/services/backup.service"
import {
  getUsers,
  getSubscriptions,
  getSubscriptionHistory,
  getScanLogs,
  getActiveSessions,
  getAllMedicalHistories,
  getAllEmergencyContacts,
  getAllLiabilityWaivers,
} from "@/src/services/storage.service"

interface TableData {
  name: string
  headers: string[]
  rows: (string | number | boolean | null | undefined)[][]
}

const ROWS_PER_PAGE = 10

export function BackupPanel() {
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [progress, setProgress] = useState<BackupProgress | null>(null)
  const [result, setResult] = useState<{ success: boolean; message: string; spreadsheetUrl?: string } | null>(null)
  const [lastBackup, setLastBackupState] = useState<string | null>(null)
  const [autoEnabled, setAutoEnabled] = useState(false)
  const [autoStatus, setAutoStatus] = useState<AutoBackupStatus>({ lastRun: null, lastResult: null, lastMessage: null })
  const [sheetUrl, setSheetUrl] = useState<string | null>(null)

  // Data preview state
  const [tables, setTables] = useState<TableData[]>([])
  const [activeTable, setActiveTable] = useState(0)
  const [isLoadingData, setIsLoadingData] = useState(false)
  const [page, setPage] = useState(0)

  useEffect(() => {
    setLastBackupState(getLastBackup())
    setAutoEnabled(isAutoBackupEnabled())
    setAutoStatus(getAutoBackupStatus())
    setSheetUrl(getSpreadsheetUrl())
  }, [])

  // Poll auto-backup status every 15s
  useEffect(() => {
    const interval = setInterval(() => {
      setAutoStatus(getAutoBackupStatus())
      setLastBackupState(getLastBackup())
      const url = getSpreadsheetUrl()
      if (url) setSheetUrl(url)
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  const handleAutoToggle = useCallback((enabled: boolean) => {
    setAutoBackupEnabled(enabled)
    setAutoEnabled(enabled)
  }, [])

  const handleBackup = async () => {
    setIsBackingUp(true)
    setResult(null)
    setProgress(null)

    const res = await backupToGoogleSheets((p) => setProgress(p))
    setResult(res)
    setIsBackingUp(false)

    if (res.success) {
      setLastBackupState(new Date().toISOString())
      if (res.spreadsheetUrl) setSheetUrl(res.spreadsheetUrl)
    }
  }

  const loadPreviewData = async () => {
    setIsLoadingData(true)
    try {
      const [users, subs, subHistory, logs, sessions, medical, emergency, waivers] = await Promise.all([
        getUsers(),
        getSubscriptions(),
        getSubscriptionHistory(),
        getScanLogs(),
        getActiveSessions(),
        getAllMedicalHistories(),
        getAllEmergencyContacts(),
        getAllLiabilityWaivers(),
      ])

      const data: TableData[] = [
        {
          name: "Users",
          headers: ["User ID", "Name", "Email", "Phone", "Birthday", "Goal", "Program", "Created At"],
          rows: users.map((u) => [u.userId, u.name, u.email, u.phone, u.birthday, u.goal, u.programType, u.createdAt]),
        },
        {
          name: "Subscriptions",
          headers: ["User ID", "Start Date", "End Date", "Status", "Plan", "Type", "Payment"],
          rows: subs.map((s) => [s.userId, s.startDate, s.endDate, s.status, s.planDuration, s.membershipType, s.paymentStatus]),
        },
        {
          name: "History",
          headers: ["ID", "User ID", "Start Date", "End Date", "Status", "Created At"],
          rows: subHistory.map((h) => [h.id, h.userId, h.startDate, h.endDate, h.status, h.createdAt]),
        },
        {
          name: "Scan Logs",
          headers: ["ID", "User ID", "Name", "Timestamp", "Action", "Status"],
          rows: logs.map((l) => [l.id, l.userId, l.userName, l.timestamp, l.action, l.status]),
        },
        {
          name: "Active",
          headers: ["User ID", "Name", "Check-in Time"],
          rows: sessions.map((s) => [s.userId, s.userName, s.checkInTime]),
        },
        {
          name: "Medical",
          headers: ["User ID", "Heart", "Blood Pressure", "Chest Pain", "Asthma", "Joints", "Smoking", "Medication"],
          rows: medical.map((m) => [m.userId, m.heartProblems, m.bloodPressureProblems, m.chestPainExercising, m.asthmaBreathingProblems, m.jointProblems, m.smoking, m.medication]),
        },
        {
          name: "Emergency",
          headers: ["User ID", "Contact Name", "Contact Number", "Created At"],
          rows: emergency.map((e) => [e.userId, e.contactName, e.contactNumber, e.createdAt]),
        },
        {
          name: "Waivers",
          headers: ["User ID", "Signature Name", "Signed Date", "Accepted", "Created At"],
          rows: waivers.map((w) => [w.userId, w.signatureName, w.signedDate, w.waiverAccepted, w.createdAt]),
        },
      ]

      setTables(data)
      setActiveTable(0)
      setPage(0)
    } finally {
      setIsLoadingData(false)
    }
  }

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
  }

  const formatCell = (value: string | number | boolean | null | undefined) => {
    if (value === null || value === undefined || value === "") return "—"
    if (typeof value === "boolean") return value ? "Yes" : "No"
    return String(value)
  }

  const progressPercent = progress ? (progress.current / progress.total) * 100 : 0

  const currentTable = tables[activeTable]
  const totalPages = currentTable ? Math.ceil(currentTable.rows.length / ROWS_PER_PAGE) : 0
  const pagedRows = currentTable ? currentTable.rows.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE) : []

  return (
    <div className="space-y-6">
      {/* Backup Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDriveDownload className="w-5 h-5" />
            Backup Data
          </CardTitle>
          <CardDescription>
            Export all gym data to Google Sheets
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {lastBackup && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              Last backup: {formatDate(lastBackup)}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleBackup}
              disabled={isBackingUp}
              size="lg"
            >
              {isBackingUp ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Backing up...
                </>
              ) : (
                <>
                  <HardDriveDownload className="w-4 h-4 mr-2" />
                  Backup Now
                </>
              )}
            </Button>

            {sheetUrl && (
              <a href={sheetUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="lg">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Google Sheet
                </Button>
              </a>
            )}
          </div>

          {isBackingUp && progress && (
            <div className="space-y-2">
              <Progress value={progressPercent} />
              <p className="text-sm text-muted-foreground">
                {progress.step} ({progress.current}/{progress.total})
              </p>
            </div>
          )}

          {result && (
            <Alert variant={result.success ? "default" : "destructive"}>
              {result.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>{result.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Realtime Auto Backup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="w-5 h-5" />
            Realtime Auto Backup
          </CardTitle>
          <CardDescription>
            Automatically backs up whenever data changes in the database
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">Enable Realtime Backup</label>
              <p className="text-xs text-muted-foreground">
                Syncs to Google Sheets automatically when members, subscriptions, or scan logs change
              </p>
            </div>
            <Switch
              checked={autoEnabled}
              onCheckedChange={handleAutoToggle}
            />
          </div>

          {autoEnabled && autoStatus.lastRun && (
            <div className={`flex items-center gap-2 text-sm ${
              autoStatus.lastResult === "success"
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }`}>
              {autoStatus.lastResult === "success" ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              Last sync: {formatDate(autoStatus.lastRun)}
              {autoStatus.lastResult === "failed" && (
                <span className="text-xs"> — {autoStatus.lastMessage}</span>
              )}
            </div>
          )}

          {autoEnabled && !autoStatus.lastRun && (
            <p className="text-sm text-muted-foreground">
              Waiting for data changes to trigger first sync...
            </p>
          )}
        </CardContent>
      </Card>

      {/* Data Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Data Preview
          </CardTitle>
          <CardDescription>
            View current database records
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            variant="outline"
            onClick={loadPreviewData}
            disabled={isLoadingData}
          >
            {isLoadingData ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : tables.length > 0 ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh Data
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Load Data Preview
              </>
            )}
          </Button>

          {tables.length > 0 && (
            <>
              {/* Table tabs */}
              <div className="flex flex-wrap gap-1">
                {tables.map((t, i) => (
                  <Button
                    key={t.name}
                    variant={activeTable === i ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setActiveTable(i); setPage(0) }}
                    className="text-xs"
                  >
                    {t.name}
                    <span className="ml-1 opacity-60">({t.rows.length})</span>
                  </Button>
                ))}
              </div>

              {/* Table content */}
              {currentTable && (
                <>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {currentTable.headers.map((h) => (
                            <TableHead key={h} className="whitespace-nowrap text-xs">{h}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedRows.length > 0 ? (
                          pagedRows.map((row, i) => (
                            <TableRow key={i}>
                              {row.map((cell, j) => (
                                <TableCell key={j} className="text-xs whitespace-nowrap max-w-[200px] truncate">
                                  {formatCell(cell)}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={currentTable.headers.length} className="text-center text-muted-foreground py-8">
                              No records
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        Page {page + 1} of {totalPages} ({currentTable.rows.length} records)
                      </p>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => Math.max(0, p - 1))}
                          disabled={page === 0}
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                          disabled={page >= totalPages - 1}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {tables.length === 0 && !isLoadingData && (
            <div className="text-center py-6 text-muted-foreground">
              <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Click &ldquo;Load Data Preview&rdquo; to view all database records</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
