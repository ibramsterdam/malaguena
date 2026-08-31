import { Controller } from "@hotwired/stimulus"

// Listens to the microphone and detects the pitch of a plucked string with
// an autocorrelation pass (ACF2+), then shows the nearest note and how many
// cents sharp or flat you are.
export default class extends Controller {
  static targets = ["note", "cents", "needle", "status", "toggle", "string"]

  static NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]
  static GUITAR_STRINGS = [
    { name: "E2", frequency: 82.41 },
    { name: "A2", frequency: 110.0 },
    { name: "D3", frequency: 146.83 },
    { name: "G3", frequency: 196.0 },
    { name: "B3", frequency: 246.94 },
    { name: "E4", frequency: 329.63 }
  ]

  connect() {
    this.listening = false
  }

  disconnect() {
    this.stop()
  }

  async toggle() {
    this.listening ? this.stop() : await this.start()
  }

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      })
    } catch {
      this.statusTarget.textContent = "Microphone access was refused — the tuner needs it to hear you."
      return
    }
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 2048
    this.audioContext.createMediaStreamSource(this.stream).connect(this.analyser)
    this.buffer = new Float32Array(this.analyser.fftSize)
    this.listening = true
    this.toggleTarget.textContent = "Stop"
    this.statusTarget.textContent = "Pluck a string…"
    this.loop()
  }

  stop() {
    this.listening = false
    cancelAnimationFrame(this.frame)
    this.stream?.getTracks().forEach(track => track.stop())
    this.audioContext?.close()
    this.audioContext = null
    this.toggleTarget.textContent = "Start tuning"
    this.statusTarget.textContent = "Microphone is off."
    this.noteTarget.textContent = "—"
    this.centsTarget.textContent = ""
    this.needleTarget.style.setProperty("--deflection", "0")
    this.stringTargets.forEach(el => el.classList.remove("near"))
  }

  loop() {
    if (!this.listening) return
    this.analyser.getFloatTimeDomainData(this.buffer)
    const pitch = this.detectPitch(this.buffer, this.audioContext.sampleRate)
    if (pitch) this.show(pitch)
    this.frame = requestAnimationFrame(() => this.loop())
  }

  // Normalized autocorrelation, searched only across the guitar's pitch
  // range. Subharmonic peaks (octave errors) lose to the smallest lag whose
  // correlation is nearly as strong. Returns Hz, or null when the signal is
  // too quiet or not periodic enough to trust.
  detectPitch(buffer, sampleRate) {
    const size = buffer.length
    const rms = Math.sqrt(buffer.reduce((sum, sample) => sum + sample * sample, 0) / size)
    if (rms < 0.01) return null

    const minLag = Math.floor(sampleRate / 1200)
    const maxLag = Math.min(Math.ceil(sampleRate / 60), size - 2)
    const correlations = new Array(maxLag + 2).fill(0)
    for (let lag = 0; lag <= maxLag + 1; lag++) {
      for (let i = 0; i < size - lag; i++) {
        correlations[lag] += buffer[i] * buffer[i + lag]
      }
      correlations[lag] /= size - lag
    }

    let peak = -1
    let peakLag = -1
    for (let lag = minLag; lag <= maxLag; lag++) {
      if (correlations[lag] > peak) {
        peak = correlations[lag]
        peakLag = lag
      }
    }
    if (peakLag <= 0 || peak < 0.3 * correlations[0]) return null

    for (let k = Math.round(peakLag / minLag); k >= 2; k--) {
      const candidate = Math.round(peakLag / k)
      if (candidate < minLag + 2) continue
      let best = candidate
      for (let lag = candidate - 2; lag <= candidate + 2; lag++) {
        if (correlations[lag] > correlations[best]) best = lag
      }
      const isLocalPeak = correlations[best] >= correlations[best - 1] && correlations[best] >= correlations[best + 1]
      if (isLocalPeak && correlations[best] > 0.85 * peak) {
        peakLag = best
        break
      }
    }

    // Parabolic interpolation around the peak for sub-sample accuracy.
    const [left, center, right] = [correlations[peakLag - 1], correlations[peakLag], correlations[peakLag + 1]]
    const a = (left + right - 2 * center) / 2
    const b = (right - left) / 2
    const lag = a ? peakLag - b / (2 * a) : peakLag

    const frequency = sampleRate / lag
    return frequency > 60 && frequency < 1200 ? frequency : null
  }

  show(frequency) {
    const midi = 69 + 12 * Math.log2(frequency / 440)
    const nearest = Math.round(midi)
    const cents = Math.round((midi - nearest) * 100)
    const name = this.constructor.NOTE_NAMES[((nearest % 12) + 12) % 12]
    const octave = Math.floor(nearest / 12) - 1

    this.noteTarget.textContent = `${name}${octave}`
    this.centsTarget.textContent =
      cents === 0 ? "in tune" : `${Math.abs(cents)} cents ${cents > 0 ? "sharp" : "flat"}`
    this.needleTarget.style.setProperty("--deflection", String(cents / 50))
    this.needleTarget.classList.toggle("in-tune", Math.abs(cents) <= 5)
    this.statusTarget.textContent = `${frequency.toFixed(1)} Hz`

    this.stringTargets.forEach(el => {
      const target = Number(el.dataset.frequency)
      el.classList.toggle("near", Math.abs(1200 * Math.log2(frequency / target)) < 60)
    })
  }
}
