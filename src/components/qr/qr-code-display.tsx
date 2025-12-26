"use client"

import { useEffect, useRef } from "react"
import QRCode from "qrcode"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"

interface QRCodeDisplayProps {
  userId: string
  userName: string
  size?: number
}

export function QRCodeDisplay({ userId, userName, size = 300 }: QRCodeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (canvasRef.current && userId) {
      const qrData = userId // Just encode the userId as plain string

      QRCode.toCanvas(
        canvasRef.current,
        qrData,
        {
          width: size,
          margin: 2,
          color: {
            dark: "#0a0f19",
            light: "#ffffff",
          },
        },
        (error) => {
          if (error) console.error("QR Code generation error:", error)
        },
      )
    }
  }, [userId, size])

  const handleDownload = () => {
    if (canvasRef.current) {
      const url = canvasRef.current.toDataURL("image/png")
      const link = document.createElement("a")
      link.download = `${userId}-${userName}.png`
      link.href = url
      link.click()
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="bg-white p-4 rounded-lg">
        <canvas ref={canvasRef} />
      </div>

      <div className="text-center">
        <p className="font-mono font-semibold text-primary">{userId}</p>
        <p className="text-sm text-muted-foreground">{userName}</p>
      </div>

      <Button onClick={handleDownload} variant="outline" className="w-full bg-transparent">
        <Download className="w-4 h-4 mr-2" />
        Download QR Code
      </Button>
    </div>
  )
}
