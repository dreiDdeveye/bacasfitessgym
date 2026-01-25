"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { storageService } from "@/src/services/storage.service"
import type { User, Subscription, MedicalHistory, EmergencyContact, LiabilityWaiver } from "@/src/types"

const subscriptionPlans = [
  { label: "1 Month", value: "1", months: 1 },
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
function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

// Add months to a date string
function addMonthsToDateString(dateStr: string, months: number): string {
  const date = parseDate(dateStr)
  if (!date) return ""
  date.setMonth(date.getMonth() + months)
  return formatDate(date)
}

// Add days to a date string
function addDaysToDateString(dateStr: string, days: number): string {
  const date = parseDate(dateStr)
  if (!date) return ""
  date.setDate(date.getDate() + days)
  return formatDate(date)
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

// ==================== MAIN COMPONENT ====================

interface AddMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onMemberAdded: () => void
}

export default function AddMemberDialog({ open, onOpenChange, onMemberAdded }: AddMemberDialogProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const totalSteps = 5

  const [formData, setFormData] = useState({
    name: "",
    birthday: "",
    age: "",
    address: "",
    phone: "",
    email: "",
    heightCm: "",
    weightKg: "",
    goal: "",
    programType: "",
    availAnnualPlan: "",
    membershipCategory: "",
    subscriptionPlan: "1",
    isWalkIn: false,
    startDate: getTodayFormatted(),
    endDate: addMonthsToDateString(getTodayFormatted(), 1),
    coaching: "",
    paymentStatus: "not paid",
    heartProblems: false,
    bloodPressureProblems: false,
    chestPain: false,
    asthma: false,
    jointProblems: false,
    neckBackProblems: false,
    pregnantRecentBirth: false,
    otherMedicalConditions: false,
    otherMedicalDetails: "",
    smoking: false,
    medication: false,
    medicationDetails: "",
    emergencyContactName: "",
    emergencyContactNumber: "",
    waiverAccepted: false,
    signatureName: "",
  })

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

  // Update end date for monthly subscriptions
  useEffect(() => {
    if (formData.availAnnualPlan === "yes" && formData.membershipCategory === "monthly") {
      const plan = subscriptionPlans.find(p => p.value === formData.subscriptionPlan)
      if (plan && isValidDateString(formData.startDate)) {
        const end = addMonthsToDateString(formData.startDate, plan.months)
        setFormData(prev => ({ ...prev, endDate: end }))
      }
    }
  }, [formData.subscriptionPlan, formData.startDate, formData.availAnnualPlan, formData.membershipCategory])

  // Update end date for daily subscriptions
  useEffect(() => {
    if (formData.availAnnualPlan === "yes" && formData.membershipCategory === "daily") {
      if (isValidDateString(formData.startDate)) {
        const end = addDaysToDateString(formData.startDate, 1)
        setFormData(prev => ({ ...prev, endDate: end }))
      }
    }
  }, [formData.startDate, formData.availAnnualPlan, formData.membershipCategory])

  const validateStep = (step: number) => {
    switch (step) {
      case 1:
        if (!formData.name) { alert("Please fill in the required field: Name"); return false }
        return true
      case 2:
        if (!formData.availAnnualPlan) { alert("Please select if you want to avail annual membership plan"); return false }
        if (formData.availAnnualPlan === "yes" && !formData.membershipCategory) { alert("Please select membership type (Monthly or Daily)"); return false }
        if (!isValidDateString(formData.startDate)) { alert("Please enter a valid start date (dd/mm/yyyy)"); return false }
        if (formData.availAnnualPlan === "no" && !isValidDateString(formData.endDate)) { alert("Please enter a valid end date (dd/mm/yyyy)"); return false }
        return true
      case 3:
        if (!formData.coaching || !formData.paymentStatus) { alert("Please complete coaching preference and payment status"); return false }
        return true
      case 4:
        if (formData.otherMedicalConditions && !formData.otherMedicalDetails.trim()) { alert("Please specify other medical conditions"); return false }
        if (formData.medication && !formData.medicationDetails.trim()) { alert("Please specify medication details"); return false }
        return true
      case 5:
        if (!formData.emergencyContactName || !formData.emergencyContactNumber) { alert("Please provide emergency contact information"); return false }
        if (!formData.waiverAccepted) { alert("Please accept the liability waiver to continue"); return false }
        if (!formData.signatureName) { alert("Please provide your signature"); return false }
        return true
      default: return true
    }
  }

  const handleNext = () => { if (validateStep(currentStep)) setCurrentStep(prev => Math.min(prev + 1, totalSteps)) }
  const handlePrevious = () => { setCurrentStep(prev => Math.max(prev - 1, 1)) }

  const handleSubmit = async () => {
    if (!validateStep(5)) return
    setIsSubmitting(true)
    try {
      const userId = await storageService.generateUserId()
      const now = new Date().toISOString()

      const user: User = {
        userId,
        name: formData.name,
        email: formData.email || "",
        phone: formData.phone || "",
        birthday: isValidDateString(formData.birthday) ? parseDate(formData.birthday)!.toISOString() : undefined,
        age: formData.age ? parseInt(formData.age) : undefined,
        address: formData.address || undefined,
        goal: formData.goal || undefined,
        programType: formData.programType || undefined,
        heightCm: formData.heightCm ? parseFloat(formData.heightCm) : undefined,
        weightKg: formData.weightKg ? parseFloat(formData.weightKg) : undefined,
        createdAt: now,
        updatedAt: now,
      }
      await storageService.addUser(user)

      const membershipType = formData.availAnnualPlan === "yes" ? "new" : "walk-in"
      const planDuration = formData.availAnnualPlan === "no"
        ? null
        : formData.membershipCategory === "monthly"
          ? `${formData.subscriptionPlan} ${formData.subscriptionPlan === "1" ? "month" : "months"}`
          : formData.membershipCategory === "daily"
            ? "daily"
            : undefined

      const subscription: Subscription = {
        userId,
        startDate: parseDate(formData.startDate)!.toISOString(),
        endDate: parseDate(formData.endDate)!.toISOString(),
        status: "active",
        planDuration,
        membershipType,
        coachingPreference: formData.coaching === "yes",
        paymentStatus: formData.paymentStatus,
        paymentDate: formData.paymentStatus === "paid" ? now : undefined,
        createdAt: now,
      }
      await storageService.addOrUpdateSubscription(subscription)

      const medicalHistory: MedicalHistory = {
        userId,
        heartProblems: formData.heartProblems,
        bloodPressureProblems: formData.bloodPressureProblems,
        chestPainExercising: formData.chestPain,
        asthmaBreathingProblems: formData.asthma,
        jointProblems: formData.jointProblems,
        neckBackProblems: formData.neckBackProblems,
        pregnantRecentBirth: formData.pregnantRecentBirth,
        otherMedicalConditions: formData.otherMedicalConditions,
        otherMedicalDetails: formData.otherMedicalDetails || undefined,
        smoking: formData.smoking,
        medication: formData.medication,
        medicationDetails: formData.medicationDetails || undefined,
        createdAt: now,
        updatedAt: now,
      }
      await storageService.addMedicalHistory(medicalHistory)

      const emergencyContact: EmergencyContact = {
        userId,
        contactName: formData.emergencyContactName,
        contactNumber: formData.emergencyContactNumber,
        createdAt: now,
        updatedAt: now,
      }
      await storageService.addEmergencyContact(emergencyContact)

      const liabilityWaiver: LiabilityWaiver = {
        userId,
        signatureName: formData.signatureName,
        signedDate: now,
        waiverAccepted: formData.waiverAccepted,
        createdAt: now,
      }
      await storageService.addLiabilityWaiver(liabilityWaiver)

      alert(`Member registered successfully! ID: ${userId}`)
      setCurrentStep(1)
      setFormData({
        name: "",
        birthday: "",
        age: "",
        address: "",
        phone: "",
        email: "",
        heightCm: "",
        weightKg: "",
        goal: "",
        programType: "",
        availAnnualPlan: "",
        membershipCategory: "",
        subscriptionPlan: "1",
        isWalkIn: false,
        startDate: getTodayFormatted(),
        endDate: addMonthsToDateString(getTodayFormatted(), 1),
        coaching: "",
        paymentStatus: "not paid",
        heartProblems: false,
        bloodPressureProblems: false,
        chestPain: false,
        asthma: false,
        jointProblems: false,
        neckBackProblems: false,
        pregnantRecentBirth: false,
        otherMedicalConditions: false,
        otherMedicalDetails: "",
        smoking: false,
        medication: false,
        medicationDetails: "",
        emergencyContactName: "",
        emergencyContactNumber: "",
        waiverAccepted: false,
        signatureName: "",
      })
      onOpenChange(false)
      onMemberAdded()
    } catch (error) {
      console.error("Error submitting form:", error)
      alert("Failed to register member. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Personal Information</h3>
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Enter full name" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <DateInput
                label="Birthday"
                value={formData.birthday}
                onChange={(value) => setFormData({ ...formData, birthday: value })}
              />
              <div className="space-y-2">
                <Label>Age</Label>
                <Input value={formData.age} disabled placeholder="Auto-calculated" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Enter address" />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="Enter phone number" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="Enter email address" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Starting Weight (kg)</Label>
                <Input type="number" value={formData.weightKg} onChange={(e) => setFormData({ ...formData, weightKg: e.target.value })} placeholder="kg" />
              </div>
              <div className="space-y-2">
                <Label>Height (cm)</Label>
                <Input type="number" value={formData.heightCm} onChange={(e) => setFormData({ ...formData, heightCm: e.target.value })} placeholder="cm" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Goal</Label>
              <Input value={formData.goal} onChange={(e) => setFormData({ ...formData, goal: e.target.value })} placeholder="Enter fitness goal" />
            </div>
            <div className="space-y-2">
              <Label>Program Type</Label>
              <Input value={formData.programType} onChange={(e) => setFormData({ ...formData, programType: e.target.value })} placeholder="Enter program type" />
            </div>
          </div>
        )
      case 2:
        return (
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Membership Details</h3>
            <div className="space-y-3">
              <Label>A. Avail annual membership plan? *</Label>
              <RadioGroup value={formData.availAnnualPlan} onValueChange={(value) => setFormData({ ...formData, availAnnualPlan: value, membershipCategory: "", isWalkIn: value === "no" })}>
                <div className="flex items-center space-x-2"><RadioGroupItem value="yes" id="annual-yes" /><Label htmlFor="annual-yes">Yes</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="no" id="annual-no" /><Label htmlFor="annual-no">No</Label></div>
              </RadioGroup>
            </div>

            {formData.availAnnualPlan === "yes" && (
              <>
                <div className="space-y-3">
                  <Label>What membership type? *</Label>
                  <RadioGroup value={formData.membershipCategory} onValueChange={(value) => setFormData({ ...formData, membershipCategory: value })}>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="monthly" id="type-monthly" /><Label htmlFor="type-monthly">Monthly</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="daily" id="type-daily" /><Label htmlFor="type-daily">Daily</Label></div>
                  </RadioGroup>
                </div>

                {formData.membershipCategory === "monthly" && (
                  <>
                    <div className="space-y-2">
                      <Label>Subscription Plan</Label>
                      <Select value={formData.subscriptionPlan} onValueChange={(v) => setFormData({ ...formData, subscriptionPlan: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {subscriptionPlans.map((p) => (
                            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <DateInput
                        label="Start Date"
                        value={formData.startDate}
                        onChange={(value) => setFormData({ ...formData, startDate: value })}
                      />
                      <DateInput
                        label="End Date"
                        value={formData.endDate}
                        onChange={(value) => setFormData({ ...formData, endDate: value })}
                        disabled
                      />
                    </div>
                  </>
                )}

                {formData.membershipCategory === "daily" && (
                  <div className="grid grid-cols-2 gap-4">
                    <DateInput
                      label="Start Date"
                      value={formData.startDate}
                      onChange={(value) => setFormData({ ...formData, startDate: value })}
                    />
                    <div className="space-y-2">
                      <Label>Expires</Label>
                      <Input value="12:00 AM (Next Day)" disabled />
                    </div>
                  </div>
                )}
              </>
            )}

            {formData.availAnnualPlan === "no" && (
              <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                <Label className="text-base font-semibold">B. Walk-in Only</Label>
                <p className="text-sm text-muted-foreground">Custom start and end dates</p>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <DateInput
                    label="Start Date"
                    value={formData.startDate}
                    onChange={(value) => setFormData({ ...formData, startDate: value })}
                  />
                  <DateInput
                    label="End Date"
                    value={formData.endDate}
                    onChange={(value) => setFormData({ ...formData, endDate: value })}
                  />
                </div>
              </div>
            )}
          </div>
        )
      case 3:
        return (
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Coaching & Payment</h3>
            <div className="space-y-3">
              <Label>Avail 1 on 1 Coaching? *</Label>
              <RadioGroup value={formData.coaching} onValueChange={(value) => setFormData({ ...formData, coaching: value })}>
                <div className="flex items-center space-x-2"><RadioGroupItem value="yes" id="coaching-yes" /><Label htmlFor="coaching-yes">Yes</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="no" id="coaching-no" /><Label htmlFor="coaching-no">No</Label></div>
              </RadioGroup>
            </div>
            <div className="space-y-3">
              <Label>Payment Status *</Label>
              <RadioGroup value={formData.paymentStatus} onValueChange={(value) => setFormData({ ...formData, paymentStatus: value })}>
                <div className="flex items-center space-x-2"><RadioGroupItem value="paid" id="payment-paid" /><Label htmlFor="payment-paid">Paid</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="not paid" id="payment-not-paid" /><Label htmlFor="payment-not-paid">Not Paid</Label></div>
              </RadioGroup>
            </div>
          </div>
        )
      case 4:
        return (
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Medical History</h3>
            <p className="text-sm text-muted-foreground">Please answer all questions honestly</p>
            <div className="space-y-3">
              {[
                { key: "heartProblems", label: "Heart Problems" },
                { key: "bloodPressureProblems", label: "Blood Pressure Problems" },
                { key: "chestPain", label: "Chest Pain While Exercising" },
                { key: "asthma", label: "Asthma or Breathing Problems" },
                { key: "jointProblems", label: "Joint Problems" },
                { key: "neckBackProblems", label: "Neck or Back Problems" },
                { key: "pregnantRecentBirth", label: "Pregnant / Just Gave Birth" },
                { key: "smoking", label: "Do you smoke?" },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between p-3 border rounded-lg">
                  <Label>{item.label}</Label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name={item.key}
                        checked={formData[item.key as keyof typeof formData] === true}
                        onChange={() => setFormData({ ...formData, [item.key]: true })}
                        className="cursor-pointer"
                      />
                      Yes
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name={item.key}
                        checked={formData[item.key as keyof typeof formData] === false}
                        onChange={() => setFormData({ ...formData, [item.key]: false })}
                        className="cursor-pointer"
                      />
                      No
                    </label>
                  </div>
                </div>
              ))}
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <Label>Any other medical condition?</Label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="otherMedicalConditions"
                        checked={formData.otherMedicalConditions === true}
                        onChange={() => setFormData({ ...formData, otherMedicalConditions: true })}
                        className="cursor-pointer"
                      />
                      Yes
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="otherMedicalConditions"
                        checked={formData.otherMedicalConditions === false}
                        onChange={() => setFormData({ ...formData, otherMedicalConditions: false })}
                        className="cursor-pointer"
                      />
                      No
                    </label>
                  </div>
                </div>
                {formData.otherMedicalConditions && (
                  <Input
                    value={formData.otherMedicalDetails}
                    onChange={(e) => setFormData({ ...formData, otherMedicalDetails: e.target.value })}
                    placeholder="Please specify"
                  />
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <Label>Are you on any medication?</Label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="medication"
                        checked={formData.medication === true}
                        onChange={() => setFormData({ ...formData, medication: true })}
                        className="cursor-pointer"
                      />
                      Yes
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="medication"
                        checked={formData.medication === false}
                        onChange={() => setFormData({ ...formData, medication: false })}
                        className="cursor-pointer"
                      />
                      No
                    </label>
                  </div>
                </div>
                {formData.medication && (
                  <Input
                    value={formData.medicationDetails}
                    onChange={(e) => setFormData({ ...formData, medicationDetails: e.target.value })}
                    placeholder="Please specify medication"
                  />
                )}
              </div>
            </div>
          </div>
        )
      case 5:
        return (
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Liability Waiver</h3>
            <div className="p-4 border rounded-lg bg-muted/30 text-sm space-y-2 max-h-48 overflow-y-auto">
              <p className="font-semibold underline">Liability Waiver</p>
              <p>I, the undersigned, being aware of my own health and physical condition and having the knowledge that my participation in my exercise program may be injurious to my health. I am voluntarily participating in physical activities.</p>
              <p>Having knowledge, I hereby acknowledge this release, any representative agents and successors from liability for accident injury or illness with may incur as a result of participants in the said physical activities. I hereby assume all risk connected therewith and consent to participate in the said program.</p>
              <p>I agree to disclose any physical limitations, disabilities, ailments, or impairments, which, may affect my ability to participate in said fitness program.</p>
            </div>
            <div className="space-y-2">
              <Label>Emergency Contact Person *</Label>
              <Input
                value={formData.emergencyContactName}
                onChange={(e) => setFormData({ ...formData, emergencyContactName: e.target.value })}
                placeholder="Enter emergency contact name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Emergency Contact Number *</Label>
              <Input
                value={formData.emergencyContactNumber}
                onChange={(e) => setFormData({ ...formData, emergencyContactNumber: e.target.value })}
                placeholder="Enter emergency contact number"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Signature (Type Your Name) *</Label>
              <Input
                value={formData.signatureName}
                onChange={(e) => setFormData({ ...formData, signatureName: e.target.value })}
                placeholder="Type your full name as signature"
                required
              />
            </div>
            <div className="flex items-center space-x-2 p-4 border rounded-lg">
              <Checkbox
                id="waiver"
                checked={formData.waiverAccepted}
                onCheckedChange={(checked) => setFormData({ ...formData, waiverAccepted: checked as boolean })}
              />
              <Label htmlFor="waiver" className="text-sm cursor-pointer">
                I have read and accept the liability waiver *
              </Label>
            </div>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Member</DialogTitle>
          <DialogDescription>Step {currentStep} of {totalSteps}</DialogDescription>
        </DialogHeader>
        <div className="mb-4">
          <div className="flex gap-2">
            {Array.from({ length: totalSteps }, (_, i) => (
              <div key={i} className={`h-2 flex-1 rounded ${i + 1 <= currentStep ? "bg-blue-600" : "bg-gray-200"}`} />
            ))}
          </div>
        </div>
        {renderStep()}
        <div className="flex justify-between pt-4 border-t">
          <Button type="button" variant="outline" onClick={handlePrevious} disabled={currentStep === 1 || isSubmitting}>
            <ChevronLeft className="w-4 h-4 mr-1" />Previous
          </Button>
          {currentStep < totalSteps ? (
            <Button type="button" onClick={handleNext} disabled={isSubmitting}>
              Next<ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit Registration"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}