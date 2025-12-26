let expiredAudio: HTMLAudioElement | null = null

export function playExpiredSound() {
  if (typeof window === "undefined") return

  if (!expiredAudio) {
    expiredAudio = new Audio("/sounds/expired.wav")
    expiredAudio.volume = 1
  }

  expiredAudio.currentTime = 0
  expiredAudio.play().catch(() => {})
}
