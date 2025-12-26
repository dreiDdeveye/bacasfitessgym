"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { LogOut, Clock } from "lucide-react"
import type { ActiveSession } from "@/src/types"
import { storageService } from "@/src/services/storage.service"
import { accessService } from "@/src/services/access.service"

interface ActiveSessionsProps {
  onUpdate: () => void
}

export function ActiveSessions({ onUpdate }: ActiveSessionsProps) {
  const [sessions, setSessions] = useState<ActiveSession[]>([])

  const loadSessions = async () => {
    const data = await storageService.getActiveSessions()
    setSessions(data)
  }

  useEffect(() => {
    loadSessions()
  }, [])

  const handleCheckOut = async (userId: string) => {
    await accessService.processCheckOut(userId)
    await loadSessions()
    onUpdate()
  }

  const formatDuration = (checkInTime: string): string => {
    const now = new Date()
    const checkIn = new Date(checkInTime)
    const diffMs = now.getTime() - checkIn.getTime()
    const minutes = Math.floor(diffMs / 60000)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`
    }
    return `${minutes}m`
  }

  if (sessions.length === 0) {
    return (
      <Card className="p-12 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="p-6 bg-muted rounded-full">
            <Clock className="w-12 h-12 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">No Active Sessions</h3>
            <p className="text-sm text-muted-foreground mt-1">No members are currently checked in</p>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="grid gap-4">
      {sessions.map((session) => (
        <Card key={session.userId} className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-lg">{session.userName}</h3>
                <Badge variant="default">Active</Badge>
              </div>

              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                <p className="font-mono text-primary">{session.userId}</p>
                <div className="flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  <span>Duration: {formatDuration(session.checkInTime)}</span>
                </div>
                <p className="text-xs">Checked in at {new Date(session.checkInTime).toLocaleTimeString()}</p>
              </div>
            </div>

            <Button variant="outline" onClick={() => handleCheckOut(session.userId)}>
              <LogOut className="w-4 h-4 mr-2" />
              Check Out
            </Button>
          </div>
        </Card>
      ))}
    </div>
  )
}
