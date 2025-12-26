"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "./components/layout/sidebar"
import { LoginPage } from "./components/auth/login-page"
import { ScannerInterface } from "./components/scanner/scanner-interface"
import { MemberList } from "./components/members/member-list"
import { ActiveSessions } from "./components/active/active-sessions"
import { ScanLogs } from "./components/logs/scan-logs"
import { AnalyticsDashboard } from "./components/analytics/analytics-dashboard"
import { AddMemberDialog } from "./components/members/add-member-dialog"
import { BulkImportDialog } from "./components/members/bulk-import-dialog"
import { Button } from "@/components/ui/button"
import { Plus, Upload, AlertTriangle } from "lucide-react"
import { storageService } from "@/src/services/storage.service"
import { subscriptionService } from "@/src/services/subscription.service"
import type { User } from "@/src/types"
import { Alert, AlertDescription } from "@/components/ui/alert"

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [activeTab, setActiveTab] = useState("scanner")
  const [users, setUsers] = useState<User[]>([])
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [expiringCount, setExpiringCount] = useState(0)

  useEffect(() => {
    const token = localStorage.getItem("bacasfitness_admin_token")
    setIsAuthenticated(!!token)
  }, [])

  const loadUsers = async () => {
    const loadedUsers = await storageService.getUsers()
    setUsers(loadedUsers)
    const expiring = await subscriptionService.getUsersWithExpiringSubs(7)
    setExpiringCount(expiring.length)
  }

  useEffect(() => {
    if (isAuthenticated) {
      loadUsers()
    }
  }, [refreshKey, isAuthenticated])

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1)
  }

  const handleLogout = () => {
    localStorage.removeItem("bacasfitness_admin_token")
    setIsAuthenticated(false)
    setActiveTab("scanner")
  }

  const handleLoginSuccess = () => {
    setIsAuthenticated(true)
  }

  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onLogout={handleLogout} />

      <main className="flex-1 overflow-auto">
        <div className="container mx-auto p-8 max-w-6xl">
          {expiringCount > 0 && activeTab === "members" && (
            <Alert className="mb-6 bg-amber-500/10 border-amber-500/20">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-amber-500">
                <strong>{expiringCount}</strong> member{expiringCount > 1 ? "s have" : " has"} subscription
                {expiringCount > 1 ? "s" : ""} expiring within 7 days
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold">
                {activeTab === "scanner" && "QR Code Scanner"}
                {activeTab === "members" && "Member Management"}
                {activeTab === "active" && "Active Sessions"}
                {activeTab === "logs" && "Scan Logs"}
                {activeTab === "analytics" && "Analytics Dashboard"}
              </h1>
              <p className="text-muted-foreground mt-1">
                {activeTab === "scanner" && "Scan member QR codes for check-in and check-out"}
                {activeTab === "members" && "Manage gym members and subscriptions"}
                {activeTab === "active" && "View currently checked-in members"}
                {activeTab === "logs" && "View scan history and activity logs"}
                {activeTab === "analytics" && "Visualize gym attendance trends and patterns"}
              </p>
            </div>

            {activeTab === "members" && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowBulkImport(true)}>
                  <Upload className="w-4 h-4 mr-2" />
                  Bulk Import
                </Button>
                <Button onClick={() => setShowAddDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Member
                </Button>
              </div>
            )}
          </div>

          {activeTab === "scanner" && <ScannerInterface />}
          {activeTab === "members" && <MemberList users={users} onUpdate={handleRefresh} />}
          {activeTab === "active" && <ActiveSessions onUpdate={handleRefresh} />}
          {activeTab === "logs" && <ScanLogs />}
          {activeTab === "analytics" && <AnalyticsDashboard />}
        </div>
      </main>

      <AddMemberDialog open={showAddDialog} onOpenChange={setShowAddDialog} onMemberAdded={handleRefresh} />

      <BulkImportDialog open={showBulkImport} onOpenChange={setShowBulkImport} onImportComplete={handleRefresh} />
    </div>
  )
}

export default App
