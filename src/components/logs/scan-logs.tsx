"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LogIn, LogOut, AlertCircle, Calendar } from "lucide-react"
import type { ScanLog } from "@/src/types"
import { storageService } from "@/src/services/storage.service"

export function ScanLogs() {
  const [logs, setLogs] = useState<ScanLog[]>([])
  const [filter, setFilter] = useState<"all" | "today">("today")

  const loadLogs = async () => {
    if (filter === "today") {
      const todayLogs = await storageService.getTodayScanLogs()
      setLogs(todayLogs)
    } else {
      const allLogs = await storageService.getScanLogs()
      setLogs(allLogs.slice(0, 100)) // Last 100 logs
    }
  }

  useEffect(() => {
    loadLogs()
  }, [filter])

  const getStatusBadge = (log: ScanLog) => {
    if (log.status === "success") {
      return <Badge variant="default">Success</Badge>
    } else if (log.status === "expired") {
      return <Badge variant="destructive">Expired</Badge>
    } else if (log.status === "invalid") {
      return <Badge variant="secondary">Invalid</Badge>
    } else {
      return <Badge variant="destructive">Not Applicable</Badge> // For "not-applicable" action or others
    }
  }

  const getActionIcon = (action: string) => {
    if (action === "check-in") return <LogIn className="w-4 h-4" />
    if (action === "check-out") return <LogOut className="w-4 h-4" />
    return <AlertCircle className="w-4 h-4" /> // For "not-applicable" or unknown actions
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Scan History</h2>
        <div className="flex gap-2">
          <Button variant={filter === "today" ? "default" : "outline"} size="sm" onClick={() => setFilter("today")}>
            <Calendar className="w-4 h-4 mr-2" />
            Today
          </Button>
          <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>
            All Logs
          </Button>
        </div>
      </div>

      {logs.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="p-6 bg-muted rounded-full">
              <AlertCircle className="w-12 h-12 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">No Scan Logs</h3>
              <p className="text-sm text-muted-foreground mt-1">
                No scans recorded {filter === "today" ? "today" : "yet"}
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <Card key={log.id} className="p-4">
              <div className="flex items-center gap-4">
                <div
                  className={`p-2 rounded-lg ${
                    log.action === "check-in" ? "bg-primary/10" :
                    log.action === "check-out" ? "bg-accent/10" :
                    "bg-destructive/10"
                  }`}
                >
                  {getActionIcon(log.action)}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{log.userName}</span>
                    {getStatusBadge(log)}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                    <span className="font-mono">{log.userId}</span>
                    <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>

                <Badge variant={
                  log.action === "check-in" ? "default" :
                  log.action === "check-out" ? "secondary" :
                  "destructive"
                }>
                  {log.action === "check-in" ? "Check In" :
                   log.action === "check-out" ? "Check Out" :
                   "Not Applicable"}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
