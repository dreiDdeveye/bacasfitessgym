"use client"

import { useState, useEffect } from "react"
import type { User, Subscription } from "@/src/types"
import { storageService } from "@/src/services/storage.service"
import { subscriptionService } from "@/src/services/subscription.service"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  QrCode,
  Trash2,
  RotateCw,
  Edit,
  History,
  AlertTriangle,
  Clock,
  Download,
  MoreVertical,
  Filter,
} from "lucide-react"
import { QRCodeDisplay } from "../qr/qr-code-display"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { EditMemberDialog } from "./edit-member-dialog"
import { ViewMemberDialog } from "./view-member-dialog"
import { SubscriptionHistoryDialog } from "./subscription-history-dialog"
import { ScanHistoryDialog } from "./scan-history-dialog"
import { RenewMemberDialog } from "./renew-member-dialog"

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface MemberListProps {
  users: User[]
  onUpdate: () => void
}

export function MemberList({ users, onUpdate }: MemberListProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "expired">("all")
  const [planFilter, setPlanFilter] = useState<string>("all")
  const [membershipTypeFilter, setMembershipTypeFilter] = useState<string>("all")
  const [filteredUsers, setFilteredUsers] = useState<User[]>(users)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showQR, setShowQR] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showView, setShowView] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showScanHistory, setShowScanHistory] = useState(false)
  const [showRenew, setShowRenew] = useState(false)
  const [subscriptionCache, setSubscriptionCache] =
    useState<Map<string, Subscription | null>>(new Map())

  /* ---------------- OPTIMIZED SUBSCRIPTIONS CACHE ---------------- */
  useEffect(() => {
    const loadSubscriptions = async () => {
      // Fetch ALL subscriptions at once instead of one by one
      const allSubscriptions = await storageService.getSubscriptions()
      
      // Create a Map for O(1) lookups
      const cache = new Map<string, Subscription | null>(
        allSubscriptions.map(sub => [sub.userId, sub])
      )
      
      // Add null entries for users without subscriptions
      for (const user of users) {
        if (!cache.has(user.userId)) {
          cache.set(user.userId, null)
        }
      }
      
      setSubscriptionCache(cache)
    }
    loadSubscriptions()
  }, [users])

  /* ---------------- SEARCH & FILTER ---------------- */
  useEffect(() => {
    const term = searchTerm.toLowerCase()
    
    setFilteredUsers(
      users.filter((u) => {
        // Search filter
        const matchesSearch =
          u.name.toLowerCase().includes(term) ||
          (u.email && u.email.toLowerCase().includes(term)) ||
          (u.phone && u.phone.toLowerCase().includes(term)) ||
          u.userId.toLowerCase().includes(term)
        
        if (!matchesSearch) return false
        
        const sub = subscriptionCache.get(u.userId)
        const active = isActive(sub)
        
        // Status filter
        if (statusFilter === "active" && !active) return false
        if (statusFilter === "expired" && active) return false
        
        // Plan duration filter
        if (planFilter !== "all") {
          if (planFilter === "walk-in") {
            // Filter for walk-ins (no planDuration)
            if (sub?.planDuration) return false
          } else {
            // Filter for specific plan durations
            if (!sub?.planDuration || sub.planDuration !== planFilter) return false
          }
        }
        
        // Membership type filter
        if (membershipTypeFilter !== "all") {
          if (!sub?.membershipType || sub.membershipType !== membershipTypeFilter) return false
        }
        
        return true
      })
    )
  }, [searchTerm, statusFilter, planFilter, membershipTypeFilter, users, subscriptionCache])

  const getSubscription = (userId: string): Subscription | null =>
    subscriptionCache.get(userId) ?? null

  const isActive = (sub: Subscription | null | undefined) =>
    subscriptionService.isSubscriptionActive(sub ?? null)

  const getRemainingDays = (sub: Subscription | null) =>
    subscriptionService.getRemainingDays(sub)

  const isExpiringSoon = (sub: Subscription | null) =>
    subscriptionService.isExpiringSoon(sub, 3)

  const formatDate = (date?: string | Date | null) => {
    if (!date) return "—"
    return new Date(date).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  const formatPlanDuration = (planDuration?: string | null) => {
    if (!planDuration) return "Walk-in"
    
    const planMap: Record<string, string> = {
      "1 month": "1 Month",
      "6 months": "6 Months", 
      "12 months": "1 Year",
      "daily": "Daily",
    }
    
    return planMap[planDuration] || planDuration
  }

  const formatMembershipType = (type?: string) => {
    if (!type) return ""
    return type.charAt(0).toUpperCase() + type.slice(1)
  }

  const clearAllFilters = () => {
    setSearchTerm("")
    setStatusFilter("all")
    setPlanFilter("all")
    setMembershipTypeFilter("all")
  }

  const hasActiveFilters = statusFilter !== "all" || planFilter !== "all" || membershipTypeFilter !== "all" || searchTerm !== ""

  /* ---------------- ACTIONS ---------------- */
  const handleDelete = async (userId: string) => {
    if (!confirm("Delete this member?")) return
    await storageService.deleteUser(userId)
    onUpdate()
  }

  const handleNameClick = (user: User) => {
    setSelectedUser(user)
    setShowView(true)
  }

  /* ---------------- CSV EXPORT ---------------- */
  const downloadTotalHoursCSV = async () => {
    const rows: {
      name: string
      email: string | undefined
      phone: string | undefined
      heightCm: number | undefined
      weightKg: number | undefined
      totalMs: number
    }[] = []

    for (const user of users) {
      const logs = await storageService.getScanLogsByUserId(user.userId)
      if (!logs.length) continue

      const sorted = logs.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() -
          new Date(b.timestamp).getTime()
      )

      let lastIn: Date | null = null
      let totalMs = 0

      for (const log of sorted) {
        if (log.action === "check-in") lastIn = new Date(log.timestamp)
        if (log.action === "check-out" && lastIn) {
          totalMs +=
            new Date(log.timestamp).getTime() - lastIn.getTime()
          lastIn = null
        }
      }

      rows.push({
        name: user.name,
        email: user.email,
        phone: user.phone,
        heightCm: user.heightCm,
        weightKg: user.weightKg,
        totalMs,
      })
    }

    rows.sort((a, b) => b.totalMs - a.totalMs)

    const csv = [
      ["Rank", "Name", "Email", "Phone", "Height (cm)", "Weight (kg)", "Total Hours"],
      ...rows.map((r, i) => [
        i + 1,
        r.name,
        r.email || "",
        r.phone || "",
        r.heightCm || "",
        r.weightKg || "",
        (r.totalMs / 3600000).toFixed(2),
      ]),
    ]
      .map((r) => r.join(","))
      .join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)

    const a = document.createElement("a")
    a.href = url
    a.download = "members_total_hours_ranked.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  /* ======================= UI ======================= */
  return (
    <>
      {/* Search */}
      <input
        className="mb-4 w-full border rounded px-3 py-2"
        placeholder="Search members..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      {/* Filters */}
      <div className="mb-4 flex gap-3 flex-wrap items-center">
        {/* Status Filter */}
        <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
          <SelectTrigger className="w-[160px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active Only</SelectItem>
            <SelectItem value="expired">Expired Only</SelectItem>
          </SelectContent>
        </Select>

        {/* Plan Duration Filter */}
        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="w-[160px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Plans</SelectItem>
            <SelectItem value="1 month">1 Month</SelectItem>
            <SelectItem value="6 months">6 Months</SelectItem>
            <SelectItem value="12 months">1 Year</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="walk-in">Walk-in</SelectItem>
          </SelectContent>
        </Select>

        {/* Membership Type Filter */}
        <Select value={membershipTypeFilter} onValueChange={setMembershipTypeFilter}>
          <SelectTrigger className="w-[160px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="renewal">Renewal</SelectItem>
            <SelectItem value="walk-in">Walk-in</SelectItem>
          </SelectContent>
        </Select>

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearAllFilters}>
            Clear Filters
          </Button>
        )}

        {/* Results Count */}
        <div className="flex items-center text-sm text-muted-foreground ml-auto">
          Showing {filteredUsers.length} of {users.length} members
        </div>
      </div>

      {/* Bulk Download */}
      <div className="mb-4 flex justify-end">
        <Button variant="outline" onClick={downloadTotalHoursCSV}>
          <Download className="w-4 h-4 mr-2" />
          Download Total Hours (CSV)
        </Button>
      </div>

      {/* Members */}
      <div className="grid gap-4">
        {filteredUsers.map((user) => {
          const sub = getSubscription(user.userId)
          const active = isActive(sub)

          return (
            <Card key={user.userId} className="p-4 rounded-xl border">
              <div className="flex justify-between items-center gap-4">
                {/* MEMBER INFO */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Clickable Name */}
                    <button
                      onClick={() => handleNameClick(user)}
                      className="font-bold text-primary hover:underline focus:outline-none focus:underline text-left"
                    >
                      {user.name}
                    </button>
                    <span className="text-sm text-muted-foreground font-mono">
                      {user.userId}
                    </span>
                    <Badge variant={active ? "default" : "destructive"} className="text-xs">
                      {active ? "Active" : "Expired"}
                    </Badge>
                    {/* Only show planDuration badge */}
{sub?.planDuration && (
  <Badge variant="secondary" className="text-xs">
    {formatPlanDuration(sub.planDuration)}
  </Badge>
)}
{/* Only show membershipType badge if it's NOT a walk-in (to avoid duplication) */}
{sub?.membershipType && sub?.membershipType !== "walk-in" && (
  <Badge variant="outline" className="text-xs">
    {formatMembershipType(sub.membershipType)}
  </Badge>
)}
                    {isExpiringSoon(sub) && (
                      <Badge variant="outline" className="text-amber-500 text-xs">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Expiring Soon
                      </Badge>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {/* Height & Weight */}
                    {(user.heightCm || user.weightKg) && (
                      <span>
                        {user.heightCm && `${user.heightCm} cm`}
                        {user.heightCm && user.weightKg && " / "}
                        {user.weightKg && `${user.weightKg} kg`}
                      </span>
                    )}

                    {/* Expiry Date */}
                    <span>
                      Expires:{" "}
                      <span className={active ? "text-green-600" : "text-red-600"}>
                        {formatDate(sub?.endDate)}
                      </span>
                    </span>

                    {/* Remaining Days */}
                    {active && (
                      <span>
                        <span className="font-medium">{getRemainingDays(sub)}</span> day(s) left
                      </span>
                    )}
                  </div>
                </div>

                {/* ACTIONS */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="outline">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem
                      onClick={() => {
                        setSelectedUser(user)
                        setShowEdit(true)
                      }}
                    >
                      <Edit className="mr-2 w-4 h-4" /> Edit
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={() => {
                        setSelectedUser(user)
                        setShowHistory(true)
                      }}
                    >
                      <History className="mr-2 w-4 h-4" />
                      Subscription History
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={() => {
                        setSelectedUser(user)
                        setShowQR(true)
                      }}
                    >
                      <QrCode className="mr-2 w-4 h-4" /> QR Code
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={() => {
                        setSelectedUser(user)
                        setShowRenew(true)
                      }}
                    >
                      <RotateCw className="mr-2 w-4 h-4" /> Renew
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={() => {
                        setSelectedUser(user)
                        setShowScanHistory(true)
                      }}
                    >
                      <Clock className="mr-2 w-4 h-4" /> Scan History
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={() => handleDelete(user.userId)}
                      className="text-red-600"
                    >
                      <Trash2 className="mr-2 w-4 h-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </Card>
          )
        })}
      </div>

      {/* DIALOGS */}
      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>QR Code</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <QRCodeDisplay
              userId={selectedUser.userId}
              userName={selectedUser.name}
            />
          )}
        </DialogContent>
      </Dialog>

      <ViewMemberDialog
        user={selectedUser}
        open={showView}
        onOpenChange={setShowView}
      />

      <EditMemberDialog
        user={selectedUser}
        open={showEdit}
        onOpenChange={setShowEdit}
        onMemberUpdated={onUpdate}
      />

      <SubscriptionHistoryDialog
        userId={selectedUser?.userId || null}
        userName={selectedUser?.name || ""}
        open={showHistory}
        onOpenChange={setShowHistory}
      />

      <ScanHistoryDialog
        userId={selectedUser?.userId || null}
        userName={selectedUser?.name || ""}
        open={showScanHistory}
        onOpenChange={setShowScanHistory}
      />

      <RenewMemberDialog
        userId={selectedUser?.userId || null}
        userName={selectedUser?.name || ""}
        open={showRenew}
        onOpenChange={setShowRenew}
        onRenewed={onUpdate}
      />
    </>
  )
}