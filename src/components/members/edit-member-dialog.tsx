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

// ==================== DATE UTILITIES ====================

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
  if (!dateStr) return null
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
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

// Check if date string is valid
function isValidDateString(dateStr: string): boolean {
  return parseDate(dateStr) !== null
}

// Format Date object to dd/mm/yyyy string
function formatDateToDMY(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

// Format date input with auto slashes
function formatDateInput(value: string): string {
  const digits = value.replace(/\D/g, "")
  let formatted = ""
  for (let i = 0; i < digits.length && i < 8; i++) {
    if (i === 2 || i === 4) {
      formatted += "/"
    }
    formatted += digits[i]
  }
  return formatted
}

// Convert ISO string to dd/mm/yyyy
function isoToDMY(iso?: string): string {
  if (!iso) return ""
  try {
    const date = new Date(iso)
    return formatDateToDMY(date)
  } catch {
    return ""
  }
}

// ==================== DATE INPUT COMPONENT ====================

function DateInput({
  value,
  onChange,
  label,
  disabled = false,
  required = false,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  disabled?: boolean
  required?: boolean
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatDateInput(e.target.value)
    onChange(formatted)
  }

  return (
    <div className="space-y-2">
      <Label>{label}{required && " *"}</Label>
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

export function EditMemberDialog({ user, open, onOpenChange, onMemberUpdated }: EditMemberDialogProps) {
  const [formData, setFormData] = useState({
    name: user?.name || "",
    birthday: "",
    age: "",
    address: user?.address || "",
    email: user?.email || "",
    phone: user?.phone || "",
    heightCm: user?.heightCm?.toString() || "",
    weightKg: user?.weightKg?.toString() || "",
    goal: user?.goal || "",
    programType: user?.programType || "",
  })
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [subscriptionData, setSubscriptionData] = useState({
    subscriptionPlan: "1",
    startDate: format(new Date(), "yyyy-MM-dd"),
    endDate: format(addMonths(new Date(), 1), "yyyy-MM-dd"),
  })
  const [errors, setErrors] = useState<{ [key: string]: string }>({})
  const [isLoading, setIsLoading] = useState(false)

  // Calculate age from birthday
  useEffect(() => {
    if (isValidDateString(formData.birthday)) {
      const birthDate = parseDate(formData.birthday)!
      const today = new Date()
      let age = today.getFullYear() - birthDate.getFullYear()
      const monthDiff = today.getMonth() - birthDate.getMonth()
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--
      setFormData(prev => ({ ...prev, age: age.toString() }))
    } else {
      setFormData(prev => ({ ...prev, age: "" }))
    }
  }, [formData.birthday])

  useEffect(() => {
    if (user && open) {
      setFormData({
        name: user.name,
        birthday: isoToDMY(user.birthday),
        age: user.age?.toString() || "",
        address: user.address || "",
        email: user.email || "",
        phone: user.phone || "",
        heightCm: user.heightCm?.toString() || "",
        weightKg: user.weightKg?.toString() || "",
        goal: user.goal || "",
        programType: user.programType || "",
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
    if (formData.email.trim() && !emailRegex.test(formData.email)) {
      newErrors.email = "Invalid email format"
    }

    const phoneRegex = /^\d{10,15}$/
    if (formData.phone.trim() && !phoneRegex.test(formData.phone.replace(/\D/g, ""))) {
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
        birthday: isValidDateString(formData.birthday) ? parseDate(formData.birthday)!.toISOString() : undefined,
        age: formData.age ? parseInt(formData.age) : undefined,
        address: formData.address.trim() || undefined,
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        heightCm: formData.heightCm ? parseFloat(formData.heightCm) : undefined,
        weightKg: formData.weightKg ? parseFloat(formData.weightKg) : undefined,
        goal: formData.goal.trim() || undefined,
        programType: formData.programType.trim() || undefined,
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
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
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

          <div className="grid grid-cols-2 gap-4">
            <DateInput
              label="Birthday"
              value={formData.birthday}
              onChange={(value) => setFormData({ ...formData, birthday: value })}
            />
            <div className="space-y-2">
              <Label>Age</Label>
              <Input value={formData.age} disabled placeholder="Auto-calculated" className="bg-muted" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="123 Main St"
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
            />
            {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="1234567890"
            />
            {errors.phone && <p className="text-sm text-destructive">{errors.phone}</p>}
          </div>

          {/* Height and Weight */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="heightCm">Height (cm)</Label>
              <Input
                id="heightCm"
                type="number"
                step="0.1"
                min="0"
                max="300"
                value={formData.heightCm}
                onChange={(e) => setFormData({ ...formData, heightCm: e.target.value })}
                placeholder="170"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="weightKg">Weight (kg)</Label>
              <Input
                id="weightKg"
                type="number"
                step="0.1"
                min="0"
                max="500"
                value={formData.weightKg}
                onChange={(e) => setFormData({ ...formData, weightKg: e.target.value })}
                placeholder="70"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal">Goal</Label>
            <Input
              id="goal"
              value={formData.goal}
              onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
              placeholder="Weight loss, muscle gain, etc."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="programType">Program Type</Label>
            <Input
              id="programType"
              value={formData.programType}
              onChange={(e) => setFormData({ ...formData, programType: e.target.value })}
              placeholder="Strength training, cardio, etc."
            />
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