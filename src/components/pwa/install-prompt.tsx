"use client"

import { useState, useEffect } from "react"
import { X } from "lucide-react"

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    // Don't show if already installed or previously dismissed
    if (window.matchMedia("(display-mode: standalone)").matches) return
    if (localStorage.getItem("pwa-install-dismissed")) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShowBanner(true)
    }

    window.addEventListener("beforeinstallprompt", handler)

    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === "accepted") {
      setShowBanner(false)
    }
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setShowBanner(false)
    localStorage.setItem("pwa-install-dismissed", "true")
  }

  if (!showBanner) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-3 rounded-xl border border-[#d4a843]/30 bg-[#1a1a1a] px-4 py-3 shadow-2xl">
        <img
          src="/logo.png"
          alt="BaCasFitness"
          className="h-10 w-10 rounded-lg object-contain"
        />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">BaCasFitness</p>
          <p className="text-xs text-gray-400">Install app for the best experience</p>
        </div>

        <button
          onClick={handleDismiss}
          className="shrink-0 p-1.5 text-gray-500 hover:text-gray-300 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>

        <button
          onClick={handleInstall}
          className="shrink-0 rounded-lg border border-[#d4a843] bg-transparent px-4 py-1.5 text-sm font-semibold text-[#d4a843] hover:bg-[#d4a843]/10 transition-colors"
        >
          Install
        </button>
      </div>
    </div>
  )
}
