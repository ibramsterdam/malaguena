import { Controller } from "@hotwired/stimulus"

// One string at a time, like a clip-on tuner: pick a string, pluck it, and
// the needle shows how many cents you are off that string's pitch. Searching
// only around the chosen pitch keeps octave errors out, and holding within
// five cents for a moment rings a small bell of completion.
export default class extends Controller {
  static targets = ["note", "cents", "needle", "status", "toggle", "string"]

  static IN_TUNE_CENTS = 5
  static HOLD_FRAMES = 20 // ~a third of a second of steady, in-tune sound

  connect() {
    this.listening = false
    this.selected = null
    this.recent = []
  }

  disconnect() {
    this.stop()
  }

  async select(event) {
    const button = event.currentTarget
    this.selected = { name: button.dataset.name, frequency: Number(button.dataset.frequency) }
    this.recent = []
    this.holdFrames = 0
    this.celebrated = false
    this.stringTargets.forEach(el => el.classList.toggle("selected", el === button))
    this.noteTarget.textContent = this.selected.name
    this.centsTarget.textContent = `Pluck the ${this.selected.name} string…`
    this.needleTarget.style.setProperty("--deflection", "0")
    this.needleTarget.classList.remove("in-tune")
    if (!this.listening) await this.start()
  }

  async toggle() {
    this.listening ? this.stop() : await this.start()
  }

  async start() {
    if (!this.selected) {
      this.statusTarget.textContent = "Pick a string first — tap one of the pegs."
      return
    }
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
    this.statusTarget.textContent = "Listening…"
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
    if (pitch) this.show(pitch)
    this.frame = requestAnimationFrame(() => this.loop())
  }

  // Normalized autocorrelation, searched only within six semitones of the
  // selected string, so a subharmonic or another string can't hijack the
  // reading. Returns Hz, or null when the signal is too quiet or not
  // periodic enough to trust.
  detectPitch(buffer, sampleRate) {
    const size = buffer.length
    const rms = Math.sqrt(buffer.reduce((sum, sample) => sum + sample * sample, 0) / size)
    if (rms < 0.01) return null

    const minLag = Math.max(2, Math.floor(sampleRate / (this.selected.frequency * Math.SQRT2)))
    const maxLag = Math.min(Math.ceil((sampleRate / this.selected.frequency) * Math.SQRT2), size - 2)
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

    // Parabolic interpolation around the peak for sub-sample accuracy.
    const [left, center, right] = [correlations[peakLag - 1], correlations[peakLag], correlations[peakLag + 1]]
    const a = (left + right - 2 * center) / 2
    const b = (right - left) / 2
    const lag = a ? peakLag - b / (2 * a) : peakLag

    return sampleRate / lag
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
        this.stringTargets.find(el => el.classList.contains("selected"))?.classList.add("tuned")
      }
      this.centsTarget.textContent = this.celebrated ? `${this.selected.name} is in tune ✓` : "In tune — hold it…"
    } else {
      this.holdFrames = 0
      if (Math.abs(rounded) > 15) this.celebrated = false
      this.centsTarget.textContent =
        rounded > 0 ? `${rounded}¢ sharp — tune down` : `${-rounded}¢ flat — tune up`
    }
  }

  median(values) {
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]
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
