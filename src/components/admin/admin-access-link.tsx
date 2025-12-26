"use client"

import { Lock } from "lucide-react"

interface AdminAccessLinkProps {
  onAdminClick: () => void
}

export function AdminAccessLink({ onAdminClick }: AdminAccessLinkProps) {
  return (
    <div className="fixed bottom-8 right-8 group">
      <button
        onClick={onAdminClick}
        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors shadow-lg text-sm font-medium"
        title="Staff Only - Admin Portal"
      >
        <Lock className="w-4 h-4" />
        <span className="hidden group-hover:inline">Admin Portal</span>
      </button>
    </div>
  )
}
