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

// Plays a continuous loud beep for 5 seconds using Web Audio API
export function playLongBeep(durationSeconds = 5) {
  if (typeof window === "undefined") return

  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContext) return

    const ctx = new AudioContext()

    const oscillator = ctx.createOscillator()
    oscillator.type = "square"
    oscillator.frequency.setValueAtTime(880, ctx.currentTime)

    const gainNode = ctx.createGain()
    gainNode.gain.setValueAtTime(1.0, ctx.currentTime)

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + durationSeconds)

    oscillator.onended = () => {
      ctx.close()
    }
  } catch {
    // Fallback: loop expired.wav
    const audio = new Audio("/sounds/expired.wav")
    audio.volume = 1
    audio.loop = true
    audio.play().catch(() => {})
    setTimeout(() => {
      audio.pause()
      audio.loop = false
    }, durationSeconds * 1000)
  }
}

// ── Web Speech API ────────────────────────────────────────────────────────────

// Ensure voices are loaded (Chrome loads them async)
function getEnglishVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  return (
    voices.find(v => v.lang.startsWith("en") && v.localService === true) ||
    voices.find(v => v.lang.startsWith("en")) ||
    null
  )
}

function speak(message: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return

  // Cancel anything currently speaking
  window.speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(message)
  utterance.volume = 1      // full volume
  utterance.rate   = 0.95   // slightly slower for clarity
  utterance.pitch  = 1

  const voice = getEnglishVoice()
  if (voice) utterance.voice = voice

  // Chrome sometimes needs a tiny delay after cancel()
  setTimeout(() => {
    window.speechSynthesis.speak(utterance)
  }, 50)
}

export function speakCheckIn(name: string) {
  speak(`Welcome, ${name}. Checked in.`)
}

export function speakCheckOut(name: string) {
  speak(`Goodbye, ${name}. Checked out.`)
}

export function speakExpired(name?: string) {
  if (name) {
    speak(`Access denied. ${name}, your membership has expired.`)
  } else {
    speak(`Access denied. Invalid QR code.`)
  }
}