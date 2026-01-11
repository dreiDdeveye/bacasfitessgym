"use client"

import { useState } from "react"
import { subscriptionService } from "@/src/services/subscription.service"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Calendar, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

interface RenewMemberDialogProps {
  userId: string | null
  userName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onRenewed: () => void
}

type SubscriptionType = "regular" | "walkin"
type RegularDuration = 1 | 3 | 6 | 12

const REGULAR_OPTIONS: { label: string; months: RegularDuration }[] = [
  { label: "1 Month", months: 1 },
  { label: "3 Months", months: 3 },
  { label: "6 Months", months: 6 },
  { label: "1 Year", months: 12 },
]

export function RenewMemberDialog({
  userId,
  userName,
  open,
  onOpenChange,
  onRenewed,
}: RenewMemberDialogProps) {
  const [subscriptionType, setSubscriptionType] =
    useState<SubscriptionType>("regular")
  const [selectedDuration, setSelectedDuration] = useState<RegularDuration>(1)
  const [startDate, setStartDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  )
  const [endDate, setEndDate] = useState<string>("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleRenew = async () => {
    if (!userId) return

    setIsSubmitting(true)

    try {
      if (subscriptionType === "regular") {
        await subscriptionService.renewSubscription(userId, selectedDuration)
      } else {
        if (!endDate) {
          alert("Please select an end date")
          setIsSubmitting(false)
          return
        }
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        await subscriptionService.renewWalkIn(userId, end)
      }

      onRenewed()
      onOpenChange(false)
      resetForm()
    } catch (error) {
      console.error("Error renewing subscription:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setSubscriptionType("regular")
    setSelectedDuration(1)
    setStartDate(new Date().toISOString().split("T")[0])
    setEndDate("")
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) resetForm()
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Renew Subscription</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Renewing for <span className="font-medium">{userName}</span>
          </p>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Subscription Type Tabs */}
          <div className="flex rounded-lg border p-1 gap-1">
            <button
              type="button"
              onClick={() => setSubscriptionType("regular")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                subscriptionType === "regular"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              )}
            >
              <Clock className="w-4 h-4" />
              Regular
            </button>
            <button
              type="button"
              onClick={() => setSubscriptionType("walkin")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                subscriptionType === "walkin"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              )}
            >
              <Calendar className="w-4 h-4" />
              Walk-in
            </button>
          </div>

          {/* Regular Subscription Options */}
          {subscriptionType === "regular" && (
            <div className="space-y-3">
              <Label>Select Duration</Label>
              <div className="grid grid-cols-2 gap-2">
                {REGULAR_OPTIONS.map((option) => (
                  <button
                    key={option.months}
                    type="button"
                    onClick={() => setSelectedDuration(option.months)}
                    className={cn(
                      "px-4 py-3 rounded-lg border text-sm font-medium transition-colors",
                      selectedDuration === option.months
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Subscription will start today and end in {selectedDuration}{" "}
                month{selectedDuration > 1 ? "s" : ""}.
              </p>
            </div>
          )}

          {/* Walk-in Subscription Options */}
          {subscriptionType === "walkin" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="start-date">Start Date</Label>
                <input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border bg-background text-sm"
                  disabled
                />
                <p className="text-xs text-muted-foreground">
                  Start date is set to today.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="end-date">End Date</Label>
                <input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  className="w-full px-3 py-2 rounded-md border bg-background text-sm"
                />
              </div>

              {endDate && (
                <p className="text-xs text-muted-foreground">
                  Subscription will be active until{" "}
                  {new Date(endDate).toLocaleDateString("en-PH", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                  .
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleRenew}
            disabled={
              isSubmitting || (subscriptionType === "walkin" && !endDate)
            }
          >
            {isSubmitting ? "Renewing..." : "Renew Subscription"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}