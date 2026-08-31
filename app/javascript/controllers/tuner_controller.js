import { Controller } from "@hotwired/stimulus"

// Automatic tuner: listens to the microphone, snaps the detected pitch to
// the nearest guitar string and follows you as you move between strings —
// a few steady frames of another string slides the selection over with a
// little pulse. Holding within five cents rings a short bell of completion.
export default class extends Controller {
  static targets = ["note", "cents", "needle", "status", "toggle", "string"]

  // Ten cents is comfortably inside what an ear notices while playing —
  // guitars, rooms and laptop microphones are not lab equipment, so good
  // is good enough.
  static IN_TUNE_CENTS = 10
  static HOLD_FRAMES = 15   // ~a quarter second of steady, in-tune sound
  static SWITCH_FRAMES = 6  // steady frames of another string before following it

  connect() {
    this.listening = false
    this.strings = this.stringTargets.map(el => ({
      element: el, name: el.dataset.name, frequency: Number(el.dataset.frequency)
    }))
    this.selected = null
    this.candidate = null
    this.recent = []
  }

  disconnect() {
    this.stop()
  }

  async toggle() {
    this.listening ? this.stop() : await this.start()
  }

  async select(event) {
    this.focusString(this.strings.find(string => string.element === event.currentTarget))
    if (!this.listening) await this.start()
  }

  focusString(string) {
    if (this.selected === string) return
    this.selected = string
    this.candidate = null
    this.recent = []
    this.holdFrames = 0
    this.celebrated = false
    this.strings.forEach(s => s.element.classList.toggle("selected", s === string))
    string.element.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }],
      { duration: 250, easing: "ease-out" }
    )
    this.noteTarget.textContent = string.name
    this.centsTarget.textContent = `Pluck the ${string.name} string…`
    this.needleTarget.style.setProperty("--deflection", "0")
    this.needleTarget.classList.remove("in-tune")
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
    this.statusTarget.textContent = "Play a string…"
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
    this.needleTarget.classList.remove("in-tune")
  }

  loop() {
    if (!this.listening) return
    this.analyser.getFloatTimeDomainData(this.buffer)
    const pitch = this.detectPitch(this.buffer, this.audioContext.sampleRate)
    if (pitch) this.track(pitch)
    this.frame = requestAnimationFrame(() => this.loop())
  }

  // Follow the player: the nearest string to the detected pitch becomes a
  // candidate, and once it holds for a few frames the selection slides over.
  track(frequency) {
    const nearest = this.strings.reduce((best, string) =>
      Math.abs(Math.log2(frequency / string.frequency)) < Math.abs(Math.log2(frequency / best.frequency)) ? string : best
    )
    if (nearest !== this.selected) {
      this.candidate = this.candidate?.string === nearest
        ? { string: nearest, frames: this.candidate.frames + 1 }
        : { string: nearest, frames: 1 }
      if (!this.selected || this.candidate.frames >= this.constructor.SWITCH_FRAMES) this.focusString(nearest)
      if (nearest !== this.selected) return // still waiting it out, keep the current readout
    } else {
      this.candidate = null
    }
    this.show(frequency)
  }

  show(frequency) {
    const cents = 1200 * Math.log2(frequency / this.selected.frequency)
    this.recent.push(cents)
    if (this.recent.length > 5) this.recent.shift()
    const smooth = this.median(this.recent)
    const rounded = Math.round(smooth)
    const inTune = Math.abs(rounded) <= this.constructor.IN_TUNE_CENTS

    this.needleTarget.style.setProperty("--deflection", String(Math.max(-1, Math.min(1, smooth / 50))))
    this.needleTarget.classList.toggle("in-tune", inTune)
    this.statusTarget.textContent = `${frequency.toFixed(1)} Hz`

    if (inTune) {
      this.holdFrames += 1
      if (!this.celebrated && this.holdFrames >= this.constructor.HOLD_FRAMES) {
        this.celebrated = true
        this.bell()
        this.selected.element.classList.add("tuned")
      }
      this.centsTarget.textContent = this.celebrated ? `${this.selected.name} is in tune ✓` : "In tune, hold it…"
    } else {
      this.holdFrames = 0
      if (Math.abs(rounded) > 25) this.celebrated = false
      this.centsTarget.textContent =
        rounded > 0 ? `${rounded} sharp, tune down` : `${-rounded} flat, tune up`
    }
  }

  median(values) {
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]
  }

  // Normalized autocorrelation across the guitar's range (ACF2+). Subharmonic
  // peaks (octave errors) lose to the smallest lag whose correlation is
  // nearly as strong. Returns Hz, or null when the signal is too quiet or
  // not periodic enough to trust.
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

  // A short two-partial ding, rung once when the string settles in tune.
  bell() {
    const time = this.audioContext.currentTime
    ;[[1318.5, 0.25], [1975.5, 0.1]].forEach(([frequency, level]) => {
      const osc = this.audioContext.createOscillator()
      const gain = this.audioContext.createGain()
      osc.frequency.value = frequency
      gain.gain.setValueAtTime(level, time)
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.8)
      osc.connect(gain).connect(this.audioContext.destination)
      osc.start(time)
      osc.stop(time + 0.85)
    })
  }
}
