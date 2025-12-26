"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { storageService } from "@/src/services/storage.service"
import type { User, Subscription } from "@/src/types"
import { addMonths, format } from "date-fns"

interface EditMemberDialogProps {
  user: User | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onMemberUpdated: () => void
}

const subscriptionPlans = [
  { label: "1 Month", value: "1", months: 1 },
  { label: "3 Months", value: "3", months: 3 },
  { label: "6 Months", value: "6", months: 6 },
  { label: "1 Year", value: "12", months: 12 },
]

export function EditMemberDialog({ user, open, onOpenChange, onMemberUpdated }: EditMemberDialogProps) {
  const [formData, setFormData] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
  })
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [subscriptionData, setSubscriptionData] = useState({
    subscriptionPlan: "1",
    startDate: format(new Date(), "yyyy-MM-dd"),
    endDate: format(addMonths(new Date(), 1), "yyyy-MM-dd"),
  })
  const [errors, setErrors] = useState<{ [key: string]: string }>({})
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (user && open) {
      setFormData({
        name: user.name,
        email: user.email,
        phone: user.phone,
      })

      const loadSubscription = async () => {
        try {
          const sub = await storageService.getSubscriptionByUserId(user.userId)
          setSubscription(sub)

          if (sub) {
            const start = new Date(sub.startDate)
            const end = new Date(sub.endDate)
            const monthsDiff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30))

            let planValue = "1"
            if (monthsDiff >= 12) planValue = "12"
            else if (monthsDiff >= 6) planValue = "6"
            else if (monthsDiff >= 3) planValue = "3"

            setSubscriptionData({
              subscriptionPlan: planValue,
              startDate: format(start, "yyyy-MM-dd"),
              endDate: format(end, "yyyy-MM-dd"),
            })
          }
        } catch (error) {
          console.error("Error loading subscription:", error)
        }
      }

      loadSubscription()
      setErrors({})
    }
  }, [user, open])

  useEffect(() => {
    const plan = subscriptionPlans.find((p) => p.value === subscriptionData.subscriptionPlan)
    if (plan) {
      const start = new Date(subscriptionData.startDate)
      const end = addMonths(start, plan.months)
      setSubscriptionData((prev) => ({ ...prev, endDate: format(end, "yyyy-MM-dd") }))
    }
  }, [subscriptionData.subscriptionPlan, subscriptionData.startDate])

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {}

    if (!formData.name.trim()) {
      newErrors.name = "Name is required"
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!formData.email.trim()) {
      newErrors.email = "Email is required"
    } else if (!emailRegex.test(formData.email)) {
      newErrors.email = "Invalid email format"
    }

    const phoneRegex = /^\d{10,15}$/
    if (!formData.phone.trim()) {
      newErrors.phone = "Phone number is required"
    } else if (!phoneRegex.test(formData.phone.replace(/\D/g, ""))) {
      newErrors.phone = "Phone must be 10-15 digits"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!user || !validateForm()) return

    setIsLoading(true)
    try {
      // Update user profile
      await storageService.updateUser(user.userId, {
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
      })

      if (subscription) {
        // Archive current subscription
        await storageService.archiveSubscription(subscription)
      }

      // Create new subscription with updated dates
      const newSubscription: Subscription = {
        userId: user.userId,
        startDate: new Date(subscriptionData.startDate).toISOString(),
        endDate: new Date(subscriptionData.endDate).toISOString(),
        status: "active",
        createdAt: new Date().toISOString(),
      }
      await storageService.addOrUpdateSubscription(newSubscription)

      onMemberUpdated()
      onOpenChange(false)
    } catch (error) {
      console.error("Error updating member:", error)
      alert("Failed to update member")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Member Profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="userId">User ID</Label>
            <Input id="userId" value={user?.userId || ""} disabled className="font-mono bg-muted" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="John Doe"
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="john@example.com"
            />
            {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number *</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="1234567890"
            />
            {errors.phone && <p className="text-sm text-destructive">{errors.phone}</p>}
          </div>

          <Separator className="my-4" />

          <div className="space-y-4">
            <h3 className="font-semibold text-sm">Subscription Details</h3>

            <div className="space-y-2">
              <Label htmlFor="subscriptionPlan">Subscription Plan</Label>
              <Select
                value={subscriptionData.subscriptionPlan}
                onValueChange={(value) => setSubscriptionData({ ...subscriptionData, subscriptionPlan: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select plan" />
                </SelectTrigger>
                <SelectContent>
                  {subscriptionPlans.map((plan) => (
                    <SelectItem key={plan.value} value={plan.value}>
                      {plan.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={subscriptionData.startDate}
                  onChange={(e) => setSubscriptionData({ ...subscriptionData, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input id="endDate" type="date" value={subscriptionData.endDate} disabled className="bg-muted" />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
