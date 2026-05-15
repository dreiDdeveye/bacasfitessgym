"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import {
  Activity,
  Users,
  ScanLine,
  ClipboardList,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  X,
} from "lucide-react"
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
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 768) {
        setIsMobileOpen(false)
      }
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const SidebarContent = (
    <div
      className={cn(
        "bg-card border-r border-border flex flex-col transition-all duration-300 h-full",
        isCollapsed ? "w-20" : "w-64",
        "md:relative fixed md:translate-x-0 top-0 left-0 z-40",
        isMobileOpen
          ? "translate-x-0 shadow-lg"
          : "-translate-x-full md:translate-x-0",
        "md:shadow-none"
      )}
      style={{ height: "100vh" }}
    >
      {/* Header */}
      <div className="p-6 border-b border-border flex items-center gap-3">
        {!isCollapsed && (
          <>
            {/* Logo */}
            <Image
              src="/icon-dark-32x32.png"
              alt="BaCasFitness Logo"
              width={32}
              height={32}
              className="shrink-0"
            />

            {/* Text */}
            <div>
              <h1 className="text-2xl font-bold text-primary">BaCasFitness</h1>
              <p className="text-sm text-muted-foreground mt-1">Gym Access</p>
            </div>
          </>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="ml-auto hidden md:flex"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </Button>

        {/* Close button for mobile */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsMobileOpen(false)}
          className="ml-auto md:hidden"
          aria-label="Close sidebar"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {navigation.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id

          return (
            <button
              key={item.id}
              onClick={() => {
                onTabChange(item.id)
                setIsMobileOpen(false)
              }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                isCollapsed ? "justify-center" : "justify-start",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!isCollapsed && <span className="font-medium">{item.label}</span>}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
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

  return (
    <>
      {/* Mobile hamburger menu */}
      <div
        className={cn(
          "md:hidden fixed top-4 left-4 z-50 transition-opacity duration-200",
          isMobileOpen ? "opacity-0 pointer-events-none" : "opacity-100"
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsMobileOpen(true)}
          aria-label="Open sidebar"
        >
          <Menu className="w-6 h-6" />
        </Button>
      </div>

      {SidebarContent}

      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}
    </>
  )
}
