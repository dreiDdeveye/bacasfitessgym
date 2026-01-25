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
import { Calendar, Sun } from "lucide-react"
import { cn } from "@/lib/utils"

interface RenewMemberDialogProps {
  userId: string | null
  userName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onRenewed: () => void
}

type MembershipType = "monthly" | "daily"
type MonthlyDuration = 1 | 6 | 12

const MONTHLY_OPTIONS: { label: string; months: MonthlyDuration }[] = [
  { label: "1 Month", months: 1 },
  { label: "6 Months", months: 6 },
  { label: "1 Year", months: 12 },
]

// Format today as dd/mm/yyyy
function getTodayFormatted(): string {
  const now = new Date()
  const day = String(now.getDate()).padStart(2, "0")
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const year = now.getFullYear()
  return `${day}/${month}/${year}`
}

// Parse dd/mm/yyyy string to Date object
function parseDate(dateStr: string): Date | null {
  const parts = dateStr.split("/")
  if (parts.length !== 3) return null
  const day = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10)
  const year = parseInt(parts[2], 10)
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  if (year < 1900 || year > 2100) return null
  const date = new Date(year, month - 1, day)
  // Validate the date is real
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

// Check if date string is valid
function isValidDateString(dateStr: string): boolean {
  return parseDate(dateStr) !== null
}

// Compare two date strings
function compareDateStrings(a: string, b: string): number {
  const dateA = parseDate(a)
  const dateB = parseDate(b)
  if (!dateA || !dateB) return 0
  if (dateA < dateB) return -1
  if (dateA > dateB) return 1
  return 0
}

// Format date input with auto slashes
function formatDateInput(value: string): string {
  // Remove all non-digits
  const digits = value.replace(/\D/g, "")
  
  // Build formatted string
  let formatted = ""
  for (let i = 0; i < digits.length && i < 8; i++) {
    if (i === 2 || i === 4) {
      formatted += "/"
    }
    formatted += digits[i]
  }
  return formatted
}

// Date Input Component
function DateInput({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  disabled?: boolean
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatDateInput(e.target.value)
    onChange(formatted)
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <input
        type="text"
        placeholder="dd/mm/yyyy"
        value={value}
        onChange={handleChange}
        disabled={disabled}
        className="w-full px-3 py-2 rounded-md border bg-background text-sm disabled:opacity-50"
        maxLength={10}
      />
    </div>
  )
}

export function RenewMemberDialog({
  userId,
  userName,
  open,
  onOpenChange,
  onRenewed,
}: RenewMemberDialogProps) {
  const [isAnnualPlan, setIsAnnualPlan] = useState<boolean | null>(null)
  const [membershipType, setMembershipType] = useState<MembershipType>("monthly")
  const [selectedDuration, setSelectedDuration] = useState<MonthlyDuration>(1)
  const [startDate, setStartDate] = useState<string>(getTodayFormatted())
  const [endDate, setEndDate] = useState<string>("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isStartDateValid = isValidDateString(startDate)
  const isEndDateValid = isValidDateString(endDate)
  const isEndAfterStart = isStartDateValid && isEndDateValid && compareDateStrings(endDate, startDate) >= 0

  const handleRenew = async () => {
    if (!userId) return

    setIsSubmitting(true)

    try {
      if (isAnnualPlan) {
        if (membershipType === "monthly") {
          await subscriptionService.renewSubscription(userId, selectedDuration)
        } else {
          await subscriptionService.renewDaily(userId)
        }
      } else {
        if (!isStartDateValid || !isEndDateValid) {
          alert("Please enter valid start and end dates (dd/mm/yyyy)")
          setIsSubmitting(false)
          return
        }
        if (!isEndAfterStart) {
          alert("End date must be on or after start date")
          setIsSubmitting(false)
          return
        }
        const start = parseDate(startDate)!
        const end = parseDate(endDate)!
        await subscriptionService.renewWalkIn(userId, end, start)
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
    setIsAnnualPlan(null)
    setMembershipType("monthly")
    setSelectedDuration(1)
    setStartDate(getTodayFormatted())
    setEndDate("")
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) resetForm()
    onOpenChange(newOpen)
  }

  const isSubmitDisabled = () => {
    if (isSubmitting) return true
    if (isAnnualPlan === null) return true
    if (!isAnnualPlan && (!isStartDateValid || !isEndDateValid || !isEndAfterStart)) return true
    return false
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
          {/* Question A: Avail annual membership plan? */}
          <div className="space-y-3">
            <Label className="text-base">
              A. Avail annual membership plan?{" "}
              <span className="text-destructive">*</span>
            </Label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="annualPlan"
                  checked={isAnnualPlan === true}
                  onChange={() => setIsAnnualPlan(true)}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm">Yes</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="annualPlan"
                  checked={isAnnualPlan === false}
                  onChange={() => setIsAnnualPlan(false)}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm">No</span>
              </label>
            </div>
          </div>

          {/* Option A: Yes - Show membership type selection */}
          {isAnnualPlan === true && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="space-y-3">
                <Label className="text-base">
                  What membership type?{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="membershipType"
                      checked={membershipType === "monthly"}
                      onChange={() => setMembershipType("monthly")}
                      className="w-4 h-4 accent-primary"
                    />
                    <span className="text-sm">Monthly</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="membershipType"
                      checked={membershipType === "daily"}
                      onChange={() => setMembershipType("daily")}
                      className="w-4 h-4 accent-primary"
                    />
                    <span className="text-sm">Daily</span>
                  </label>
                </div>
              </div>

              {/* Monthly Duration Options */}
              {membershipType === "monthly" && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                  <Label>Select Duration</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {MONTHLY_OPTIONS.map((option) => (
                      <button
                        key={option.months}
                        type="button"
                        onClick={() => setSelectedDuration(option.months)}
                        className={cn(
                          "px-3 py-3 rounded-lg border text-sm font-medium transition-colors",
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

              {/* Daily Info */}
              {membershipType === "daily" && (
                <div className="p-4 rounded-lg bg-muted/50 border animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center gap-2 text-sm">
                    <Sun className="w-4 h-4 text-amber-500" />
                    <span className="font-medium">Daily Pass</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    This subscription will be valid for today only and expires
                    at <span className="font-medium">12:00 AM (midnight)</span>.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Option B: No - Walk-in with custom dates */}
          {isAnnualPlan === false && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Calendar className="w-4 h-4" />
                Walk-in Subscription
              </div>

              <DateInput
                label="Start Date"
                value={startDate}
                onChange={setStartDate}
              />

              <DateInput
                label="End Date"
                value={endDate}
                onChange={setEndDate}
              />

              {startDate.length === 10 && !isStartDateValid && (
                <p className="text-xs text-destructive">Invalid start date</p>
              )}

              {endDate.length === 10 && !isEndDateValid && (
                <p className="text-xs text-destructive">Invalid end date</p>
              )}

              {isStartDateValid && isEndDateValid && !isEndAfterStart && (
                <p className="text-xs text-destructive">
                  End date must be on or after start date
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
          <Button onClick={handleRenew} disabled={isSubmitDisabled()}>
            {isSubmitting ? "Renewing..." : "Renew Subscription"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}