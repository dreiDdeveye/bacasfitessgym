"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { storageService } from "@/src/services/storage.service"
import type { Subscription, SubscriptionHistory } from "@/src/types"
import { format } from "date-fns"

interface SubscriptionHistoryDialogProps {
  userId: string | null
  userName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SubscriptionHistoryDialog({ userId, userName, open, onOpenChange }: SubscriptionHistoryDialogProps) {
  const [history, setHistory] = useState<SubscriptionHistory[]>([])
  const [currentSubscription, setCurrentSubscription] = useState<Subscription | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (userId && open) {
      setIsLoading(true)
      const loadData = async () => {
        try {
          const historyData = await storageService.getSubscriptionHistory(userId)
          setHistory(historyData)

          const currentSub = await storageService.getSubscriptionByUserId(userId)
          setCurrentSubscription(currentSub)
        } catch (error) {
          console.error("Error loading subscription history:", error)
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
          <DialogTitle>Subscription History - {userName}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-center py-8 text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {currentSubscription && (
              <div className="border rounded-lg p-4 bg-primary/5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">Current Subscription</h3>
                  <Badge variant={currentSubscription.status === "active" ? "default" : "destructive"}>
                    {currentSubscription.status}
                  </Badge>
                </div>
                <div className="text-sm space-y-1 text-muted-foreground">
                  <p>Start: {format(new Date(currentSubscription.startDate), "MMM dd, yyyy")}</p>
                  <p>End: {format(new Date(currentSubscription.endDate), "MMM dd, yyyy")}</p>
                </div>
              </div>
            )}

            {history.length > 0 ? (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-muted-foreground">Past Subscriptions</h3>
                {history.map((sub) => (
                  <div key={sub.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline">{sub.status}</Badge>
                    </div>
                    <div className="text-sm space-y-1 text-muted-foreground">
                      <p>Start: {format(new Date(sub.startDate), "MMM dd, yyyy")}</p>
                      <p>End: {format(new Date(sub.endDate), "MMM dd, yyyy")}</p>
                      <p className="text-xs">Archived: {format(new Date(sub.updatedAt), "MMM dd, yyyy HH:mm")}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No subscription history available</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
