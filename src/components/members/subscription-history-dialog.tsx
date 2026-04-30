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

  const allSubscriptionRecords = [
    ...(currentSubscription
      ? [{
          id: `${currentSubscription.userId}-current`,
          subscription: currentSubscription,
          label: "Current Subscription",
          archivedAt: null,
          isCurrent: true,
        }]
      : []),
    ...history.map((subscription) => ({
      id: subscription.id,
      subscription,
      label: "Previous Subscription",
      archivedAt: subscription.updatedAt,
      isCurrent: false,
    })),
  ].sort((a, b) => {
    const aTime = new Date(a.subscription.startDate || a.subscription.createdAt).getTime()
    const bTime = new Date(b.subscription.startDate || b.subscription.createdAt).getTime()
    return bTime - aTime
  })

  const getEffectiveStatus = (subscription: Subscription | SubscriptionHistory) => {
    if (subscription.status === "cancelled") return "cancelled"

    const now = new Date()
    const startDate = new Date(subscription.startDate)
    const endDate = new Date(subscription.endDate)

    return subscription.status === "active" && startDate <= now && endDate >= now
      ? "active"
      : "expired"
  }

  const getPastSubscriptionStatus = (subscription: SubscriptionHistory) => {
    if (subscription.status === "cancelled") return "cancelled"
    return "expired"
  }

  const getStatusBadgeVariant = (status: "active" | "expired" | "cancelled") =>
    status === "active" ? "default" : "destructive"

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
      <DialogContent className="max-w-full sm:max-w-3xl w-[95vw] sm:w-auto">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl truncate">Subscription History - {userName}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-center py-8 text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto px-2 sm:px-0">
            {allSubscriptionRecords.length > 0 ? (
              <>
                <h3 className="font-semibold text-sm text-muted-foreground">All Subscriptions & Renewals</h3>
                {allSubscriptionRecords.map(({ id, subscription, label, archivedAt, isCurrent }, index) => {
                  const status = isCurrent
                    ? getEffectiveStatus(subscription)
                    : getPastSubscriptionStatus(subscription as SubscriptionHistory)

                  return (
                    <div key={id} className={`border rounded-lg p-4 ${isCurrent ? "bg-primary/5" : ""}`}>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2 gap-2">
                        <div>
                          <h4 className="font-semibold">{label}</h4>
                          <p className="text-xs text-muted-foreground">Record #{allSubscriptionRecords.length - index}</p>
                        </div>
                        <Badge variant={getStatusBadgeVariant(status)} className="whitespace-nowrap">
                          {status}
                        </Badge>
                      </div>
                      <div className="text-sm space-y-1 text-muted-foreground">
                        <p>Start: {format(new Date(subscription.startDate), "MMM dd, yyyy")}</p>
                        <p>End: {format(new Date(subscription.endDate), "MMM dd, yyyy")}</p>
                        {"planDuration" in subscription && subscription.planDuration && (
                          <p>Plan: {subscription.planDuration}</p>
                        )}
                        {"membershipType" in subscription && subscription.membershipType && (
                          <p>Type: {subscription.membershipType}</p>
                        )}
                        {archivedAt && (
                          <p className="text-xs">Archived: {format(new Date(archivedAt), "MMM dd, yyyy HH:mm")}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No subscription history available</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
