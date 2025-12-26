"use client"

import { useState, useEffect } from "react"
import type { User, Subscription } from "@/src/types"
import { storageService } from "@/src/services/storage.service"
import { subscriptionService } from "@/src/services/subscription.service"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { QrCode, Trash2, RotateCw, Edit, History, AlertTriangle, Clock } from "lucide-react"
import { QRCodeDisplay } from "../qr/qr-code-display"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EditMemberDialog } from "./edit-member-dialog"
import { SubscriptionHistoryDialog } from "./subscription-history-dialog"
import { ScanHistoryDialog } from "./scan-history-dialog"

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
  const [showHistory, setShowHistory] = useState(false)
  const [showScanHistory, setShowScanHistory] = useState(false)
  const [subscriptionCache, setSubscriptionCache] = useState<Map<string, Subscription | null>>(new Map())

  // Load subscriptions into cache when users change
  useEffect(() => {
    const loadSubscriptions = async () => {
      const cache = new Map<string, Subscription | null>()
      for (const user of users) {
        const subscription = await storageService.getSubscriptionByUserId(user.userId)
        cache.set(user.userId, subscription)
      }
      setSubscriptionCache(cache)
    }
    loadSubscriptions()
  }, [users])

  // Filter users whenever searchTerm or users change
  useEffect(() => {
    const term = searchTerm.toLowerCase()
    setFilteredUsers(
      users.filter((user) => {
        return (
          user.name.toLowerCase().includes(term) ||
          user.email.toLowerCase().includes(term) ||
          user.phone.toLowerCase().includes(term)
        )
      })
    )
  }, [searchTerm, users])

  const getSubscription = (userId: string): Subscription | null => {
    return subscriptionCache.get(userId) || null
  }

  const isActive = (subscription: Subscription | null): boolean => {
    return subscriptionService.isSubscriptionActive(subscription)
  }

  const getRemainingDays = (subscription: Subscription | null): number => {
    return subscriptionService.getRemainingDays(subscription)
  }

  const isExpiringSoon = (subscription: Subscription | null): boolean => {
    return subscriptionService.isExpiringSoon(subscription, 7)
  }

  const handleRenew = async (userId: string) => {
    try {
      await subscriptionService.renewSubscription(userId, 1)
      onUpdate()
    } catch (error) {
      console.error("Error renewing subscription:", error)
      alert("Failed to renew subscription")
    }
  }

  const handleDelete = async (userId: string) => {
    if (confirm("Are you sure you want to delete this member?")) {
      try {
        await storageService.deleteUser(userId)
        onUpdate()
      } catch (error) {
        console.error("Error deleting member:", error)
        alert("Failed to delete member")
      }
    }
  }

  const handleShowQR = (user: User) => {
    setSelectedUser(user)
    setShowQR(true)
  }

  const handleShowEdit = (user: User) => {
    setSelectedUser(user)
    setShowEdit(true)
  }

  const handleShowHistory = (user: User) => {
    setSelectedUser(user)
    setShowHistory(true)
  }

  const handleShowScanHistory = (user: User) => {
    setSelectedUser(user)
    setShowScanHistory(true)
  }

  return (
    <>
      {/* Search Bar */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name, email or phone..."
          className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid gap-4">
        {filteredUsers.length === 0 && (
          <p className="text-center text-muted-foreground">No members found.</p>
        )}
        {filteredUsers.map((user) => {
          const subscription = getSubscription(user.userId)
          const active = isActive(subscription)
          const daysLeft = getRemainingDays(subscription)
          const expiring = isExpiringSoon(subscription)

          return (
            <Card key={user.userId} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-lg">{user.name}</h3>
                    <Badge variant={active ? "default" : "destructive"}>
                      {active ? "Active" : "Expired"}
                    </Badge>
                    {expiring && (
                      <Badge
                        variant="outline"
                        className="bg-amber-500/10 text-amber-500 border-amber-500/20"
                      >
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Expiring Soon
                      </Badge>
                    )}
                  </div>

                  <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                    <p className="font-mono text-primary">{user.userId}</p>
                    <p>{user.email}</p>
                    <p>{user.phone}</p>
                    {subscription && (
                      <p className="text-xs">
                        {active ? `${daysLeft} days remaining` : "Subscription expired"}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => handleShowEdit(user)}
                    title="Edit Member"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>

                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => handleShowHistory(user)}
                    title="Subscription History"
                  >
                    <History className="w-4 h-4" />
                  </Button>

                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => handleShowQR(user)}
                    title="Show QR Code"
                  >
                    <QrCode className="w-4 h-4" />
                  </Button>

                  {!active && (
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => handleRenew(user.userId)}
                      title="Renew Subscription"
                    >
                      <RotateCw className="w-4 h-4" />
                    </Button>
                  )}

                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => handleDelete(user.userId)}
                    title="Delete Member"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>

                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => handleShowScanHistory(user)}
                    title="Scan History"
                  >
                    <Clock className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>QR Code - {selectedUser?.name}</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <QRCodeDisplay userId={selectedUser.userId} userName={selectedUser.name} />
          )}
        </DialogContent>
      </Dialog>

      <EditMemberDialog user={selectedUser} open={showEdit} onOpenChange={setShowEdit} onMemberUpdated={onUpdate} />

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
    </>
  )
}
