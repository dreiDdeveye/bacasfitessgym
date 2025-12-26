"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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

export function ScanHistoryDialog({ userId, userName, open, onOpenChange }: ScanHistoryDialogProps) {
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (userId && open) {
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
    }
  }, [userId, open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Scan History - {userName}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-center py-8 text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {scanLogs.length > 0 ? (
              scanLogs.map((log) => (
                <div key={log.id} className="border rounded-lg p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {log.action === "check-in" ? (
                      <LogIn className="w-5 h-5 text-green-500" />
                    ) : (
                      <LogOut className="w-5 h-5 text-blue-500" />
                    )}
                    <div>
                      <p className="font-semibold capitalize">{log.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(log.timestamp), "MMM dd, yyyy HH:mm:ss")}
                      </p>
                    </div>
                  </div>
                  <Badge variant={log.status === "success" ? "default" : "destructive"}>{log.status}</Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No scan history available</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
