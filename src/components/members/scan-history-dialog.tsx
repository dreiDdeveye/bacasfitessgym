"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { storageService } from "@/src/services/storage.service"
import type { ScanLog } from "@/src/types"
import { format } from "date-fns"
import { LogIn, LogOut } from "lucide-react"

interface ScanHistoryDialogProps {
  userId: string | null
  userName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ScanHistoryDialog({
  userId,
  userName,
  open,
  onOpenChange,
}: ScanHistoryDialogProps) {
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!userId || !open) return

    setIsLoading(true)

    const loadData = async () => {
      try {
        const logs = await storageService.getScanLogsByUserId(userId)
        setScanLogs(logs)
      } catch (error) {
        console.error("Error loading scan history:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [userId, open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-5xl">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl truncate">
            Scan History — {userName}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-center py-10 text-muted-foreground">
            Loading scan history...
          </p>
        ) : (
          <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-2">
            {scanLogs.length > 0 ? (
              scanLogs.map((log) => (
                <div
                  key={log.id}
                  className="border rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    {log.action === "check-in" ? (
                      <LogIn className="w-5 h-5 text-green-500 shrink-0" />
                    ) : (
                      <LogOut className="w-5 h-5 text-blue-500 shrink-0" />
                    )}

                    <div>
                      <p className="font-semibold capitalize">
                        {log.action.replace("-", " ")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(
                          new Date(log.timestamp),
                          "MMM dd, yyyy • hh:mm:ss a"
                        )}
                      </p>
                    </div>
                  </div>

                  <Badge
                    variant={
                      log.status === "success" ? "default" : "destructive"
                    }
                    className="whitespace-nowrap"
                  >
                    {log.status}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-10">
                No scan history available
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
