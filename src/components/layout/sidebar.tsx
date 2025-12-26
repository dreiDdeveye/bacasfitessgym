"use client"

import { useState } from "react"
import { Activity, Users, ScanLine, ClipboardList, BarChart3, ChevronLeft, ChevronRight, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface SidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
  onLogout: () => void
}

const navigation = [
  { id: "scanner", label: "QR Scanner", icon: ScanLine },
  { id: "members", label: "Members", icon: Users },
  { id: "active", label: "Active Now", icon: Activity },
  { id: "logs", label: "Scan Logs", icon: ClipboardList },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
]

export function Sidebar({ activeTab, onTabChange, onLogout }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <div
      className={cn(
        "bg-card border-r border-border flex flex-col transition-all duration-300",
        isCollapsed ? "w-20" : "w-64",
      )}
    >
      {/* Header */}
      <div className="p-6 border-b border-border flex items-center justify-between">
        {!isCollapsed && (
          <div>
            <h1 className="text-2xl font-bold text-primary">BaCasFitness</h1>
            <p className="text-sm text-muted-foreground mt-1">Gym Access</p>
          </div>
        )}
        <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(!isCollapsed)} className="ml-auto">
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {navigation.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                isCollapsed ? "justify-center" : "justify-start",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              title={isCollapsed ? item.label : ""}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!isCollapsed && <span className="font-medium">{item.label}</span>}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border space-y-4">
        <Button
          variant="outline"
          size={isCollapsed ? "icon" : "sm"}
          onClick={onLogout}
          className="w-full bg-transparent"
        >
          <LogOut className="w-4 h-4" />
          {!isCollapsed && <span className="ml-2">Logout</span>}
        </Button>
      </div>
    </div>
  )
}
