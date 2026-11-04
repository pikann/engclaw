/** Short two-note "result ready" notification sound. Silent if audio is unavailable. */
export function playChime(): void {
  try {
    const ctx = new AudioContext()
    const now = ctx.currentTime
    ;[660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      const t = now + i * 0.12
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.15, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.26)
    })
    setTimeout(() => void ctx.close(), 600)
  } catch {
    // no audio output: the chime is optional
  }
}
