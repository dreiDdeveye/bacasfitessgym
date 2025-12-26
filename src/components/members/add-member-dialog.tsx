"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { User } from "@/src/types"
import { storageService } from "@/src/services/storage.service"
import { QRCodeDisplay } from "../qr/qr-code-display"
import { addMonths, format } from "date-fns"

interface AddMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onMemberAdded: () => void
}

const subscriptionPlans = [
  { label: "1 Month", value: "1", months: 1 },
  { label: "3 Months", value: "3", months: 3 },
  { label: "6 Months", value: "6", months: 6 },
  { label: "1 Year", value: "12", months: 12 },
]

export function AddMemberDialog({ open, onOpenChange, onMemberAdded }: AddMemberDialogProps) {
  const [step, setStep] = useState<"form" | "qr">("form")
  const [newUser, setNewUser] = useState<User | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subscriptionPlan: "1",
    startDate: format(new Date(), "yyyy-MM-dd"),
    endDate: format(addMonths(new Date(), 1), "yyyy-MM-dd"),
  })

  useEffect(() => {
    const plan = subscriptionPlans.find((p) => p.value === formData.subscriptionPlan)
    if (plan) {
      const start = new Date(formData.startDate)
      const end = addMonths(start, plan.months)
      setFormData((prev) => ({ ...prev, endDate: format(end, "yyyy-MM-dd") }))
    }
  }, [formData.subscriptionPlan, formData.startDate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      // Generate user ID
      const userId = await storageService.generateUserId()
      const now = new Date().toISOString()

      // Create user
      const user: User = {
        userId,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        createdAt: now,
        updatedAt: now,
      }

      await storageService.addUser(user)

      const subscription = {
        userId,
        startDate: new Date(formData.startDate).toISOString(),
        endDate: new Date(formData.endDate).toISOString(),
        status: "active" as const,
        createdAt: now,
      }
      await storageService.addOrUpdateSubscription(subscription)

      // Show QR code
      setNewUser(user)
      setStep("qr")
    } catch (error) {
      console.error("Error adding member:", error)
      alert("Failed to add member. Please try again.")
    }
  }

  const handleClose = () => {
    setStep("form")
    setNewUser(null)
    setFormData({
      name: "",
      email: "",
      phone: "",
      subscriptionPlan: "1",
      startDate: format(new Date(), "yyyy-MM-dd"),
      endDate: format(addMonths(new Date(), 1), "yyyy-MM-dd"),
    })
    onOpenChange(false)
    onMemberAdded()
  }

  const selectedPlan = subscriptionPlans.find((p) => p.value === formData.subscriptionPlan)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {step === "form" ? (
          <>
            <DialogHeader>
              <DialogTitle>Add New Member</DialogTitle>
              <DialogDescription>Enter member details to generate their unique ID and QR code.</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="John Doe"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="john@example.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1 234 567 8900"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subscriptionPlan">Subscription Plan</Label>
                <Select
                  value={formData.subscriptionPlan}
                  onValueChange={(value) => setFormData({ ...formData, subscriptionPlan: value })}
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
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input id="endDate" type="date" value={formData.endDate} disabled className="bg-muted" />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="submit">Generate Member</Button>
              </div>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Member Created Successfully!</DialogTitle>
              <DialogDescription>QR code generated for {newUser?.name}</DialogDescription>
            </DialogHeader>

            {newUser && (
              <div className="space-y-4">
                <div className="bg-muted rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">User ID:</span>
                    <span className="font-mono font-semibold text-primary">{newUser.userId}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Name:</span>
                    <span className="font-medium">{newUser.name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subscription:</span>
                    <span className="font-medium text-success">{selectedPlan?.label} Active</span>
                  </div>
                </div>

                <QRCodeDisplay userId={newUser.userId} userName={newUser.name} />

                <Button onClick={handleClose} className="w-full">
                  Done
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
