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

interface MemberListProps {
  users: User[]
  onUpdate: () => void
}

export function MemberList({ users, onUpdate }: MemberListProps) {
  const [searchTerm, setSearchTerm] = useState("")
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

  /* ---------------- SUBSCRIPTIONS CACHE ---------------- */
  useEffect(() => {
    const loadSubscriptions = async () => {
      const cache = new Map<string, Subscription | null>()
      for (const user of users) {
        const subscription = await storageService.getSubscriptionByUserId(
          user.userId
        )
        cache.set(user.userId, subscription)
      }
      setSubscriptionCache(cache)
    }
    loadSubscriptions()
  }, [users])

  /* ---------------- SEARCH ---------------- */
  useEffect(() => {
    const term = searchTerm.toLowerCase()
    setFilteredUsers(
      users.filter(
        (u) =>
          u.name.toLowerCase().includes(term) ||
          u.email.toLowerCase().includes(term) ||
          u.phone.toLowerCase().includes(term) ||
          u.userId.toLowerCase().includes(term)
      )
    )
  }, [searchTerm, users])

  const getSubscription = (userId: string) =>
    subscriptionCache.get(userId) || null

  const isActive = (sub: Subscription | null) =>
    subscriptionService.isSubscriptionActive(sub)

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
      email: string
      phone: string
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
        r.email,
        r.phone,
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