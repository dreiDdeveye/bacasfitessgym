"use client"

import type React from "react"
import { useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertTriangle } from "lucide-react"

const ADMIN_EMAIL = "bacasfitness@gym.com"
const ADMIN_PASSWORD = "bcf@2026"

interface LoginPageProps {
  onLoginSuccess: () => void
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    await new Promise((resolve) => setTimeout(resolve, 500))

    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      localStorage.setItem("bacasfitness_admin_token", "authenticated")
      onLoginSuccess()
    } else {
      setError("Invalid email or password")
    }

    setIsLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-start pt-4 bg-gradient-to-br from-yellow-800 to-black p-4 gap-4">

      {/* BIG CENTERED LOGO */}
      <Image
        src="/logo.png"
        alt="BaCasFitness Logo"
        width={500}
        height={500}
        className="object-contain max-w-full h-auto -mb-28"
        priority
      />

      {/* LOGIN CARD */}
<Card className="w-full max-w-md bg-black/90 shadow-lg rounded-lg">
  <CardContent className="pt-8 px-8">
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <Alert className="bg-red-500/20 border-red-500/40">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <AlertDescription className="text-red-600 text-base">{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        <label className="block text-base font-semibold text-white-800">Email</label>
        <Input
          type="email"
          placeholder="bacasfitness@gym.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
          className="text-lg rounded-md"
        />
      </div>

      <div className="space-y-3">
        <label className="block text-base font-semibold text-white-800">Password</label>
        <Input
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
          className="text-lg rounded-md"
        />
      </div>

      <Button
        type="submit"
        className="w-full text-lg font-semibold rounded-md"
        disabled={isLoading}
      >
        {isLoading ? "Signing in..." : "Sign In"}
      </Button>
    </form>
  </CardContent>
</Card>

    </div>
  )
}
