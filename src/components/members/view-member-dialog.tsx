"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { storageService } from "@/src/services/storage.service"
import { subscriptionService } from "@/src/services/subscription.service"
import type { User, Subscription } from "@/src/types"
import { Mail, Phone, Ruler, Weight, Calendar, Clock, User as UserIcon } from "lucide-react"

interface ViewMemberDialogProps {
  user: User | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ViewMemberDialog({ user, open, onOpenChange }: ViewMemberDialogProps) {
  const [subscription, setSubscription] = useState<Subscription | null>(null)

  useEffect(() => {
    if (user && open) {
      const loadSubscription = async () => {
        const sub = await storageService.getSubscriptionByUserId(user.userId)
        setSubscription(sub)
      }
      loadSubscription()
    }
  }, [user, open])

  if (!user) return null

  const isActive = subscriptionService.isSubscriptionActive(subscription)
  const remainingDays = subscriptionService.getRemainingDays(subscription)

  const formatDate = (date?: string | Date | null) => {
    if (!date) return "—"
    return new Date(date).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Member Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Header with Name and Status */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold">{user.name}</h2>
              <p className="text-sm text-muted-foreground font-mono">{user.userId}</p>
            </div>
            <Badge variant={isActive ? "default" : "destructive"}>
              {isActive ? "Active" : "Expired"}
            </Badge>
          </div>

          <Separator />

          {/* Contact Information */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Contact Information
            </h3>
            <div className="grid gap-3">
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{user.email}</span>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{user.phone}</span>
              </div>
            </div>
          </div>

          {/* Physical Information */}
          {(user.heightCm || user.weightKg) && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Physical Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {user.heightCm && (
                    <div className="flex items-center gap-3">
                      <Ruler className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Height</p>
                        <p className="text-sm font-medium">{user.heightCm} cm</p>
                      </div>
                    </div>
                  )}
                  {user.weightKg && (
                    <div className="flex items-center gap-3">
                      <Weight className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Weight</p>
                        <p className="text-sm font-medium">{user.weightKg} kg</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Subscription Information */}
          <Separator />
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Subscription
            </h3>
            <div className="grid gap-3">
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Start Date</p>
                  <p className="text-sm font-medium">{formatDate(subscription?.startDate)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Expiry Date</p>
                  <p className={`text-sm font-medium ${isActive ? "text-green-600" : "text-red-600"}`}>
                    {formatDate(subscription?.endDate)}
                  </p>
                </div>
              </div>
              {isActive && (
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Remaining</p>
                    <p className="text-sm font-medium">{remainingDays} day(s)</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Member Since */}
          <Separator />
          <div className="flex items-center gap-3 text-muted-foreground">
            <UserIcon className="w-4 h-4" />
            <p className="text-xs">Member since {formatDate(user.createdAt)}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}