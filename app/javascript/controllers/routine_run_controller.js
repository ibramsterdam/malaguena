import { Controller } from "@hotwired/stimulus"

// Runs a routine: counts down each segment, pauses and resumes, advances with
// a chime, and drives the embedded metronome during tab practice segments.
export default class extends Controller {
  static targets = ["clock", "status", "toggle", "segment", "pane", "metronome"]
  static values = { segments: Array }

  connect() {
    this.index = 0
    this.state = "idle"
    this.remainingMs = this.currentSegment.seconds * 1000
    this.showSegment()
    this.render()
    this.renderClock()
  }

  disconnect() {
    clearInterval(this.timer)
    this.releaseWakeLock()
  }

  get currentSegment() {
    return this.segmentsValue[this.index]
  }

  get metronome() {
    return this.application.getControllerForElementAndIdentifier(this.metronomeTarget, "metronome")
  }

  toggle() {
    if (this.state === "running") {
      this.pause()
    } else if (this.state === "done") {
      this.restart()
    } else {
      this.resume()
    }
  }

  resume() {
    this.audioContext ||= new (window.AudioContext || window.webkitAudioContext)()
    this.state = "running"
    this.endAt = performance.now() + this.remainingMs
    this.timer = setInterval(() => this.tick(), 250)
    if (this.currentSegment.kind === "tab_practice") {
      this.metronome.setBpm(this.currentSegment.bpm)
      this.metronome.setMeter(this.currentSegment.beats)
      this.metronome.start()
    }
    this.requestWakeLock()
    this.render()
  }

  pause() {
    this.state = "paused"
    this.remainingMs = Math.max(0, this.endAt - performance.now())
    clearInterval(this.timer)
    this.metronome.stop()
    this.releaseWakeLock()
    this.render()
  }

  nudge(event) {
    this.metronome.setBpm(this.metronome.bpmValue + Number(event.params.amount))
  }

  // Tapping a segment restarts practice from the top of that segment.
  jump(event) {
    clearInterval(this.timer)
    this.metronome.stop()
    this.index = Number(event.params.index)
    this.remainingMs = this.currentSegment.seconds * 1000
    this.showSegment()
    this.state = "paused"
    this.resume()
    this.renderClock()
  }

  restart() {
    this.index = 0
    this.state = "idle"
    this.remainingMs = this.currentSegment.seconds * 1000
    this.showSegment()
    this.render()
    this.renderClock()
  }

  tick() {
    this.remainingMs = Math.max(0, this.endAt - performance.now())
    this.renderClock()
    if (this.remainingMs <= 0) this.advance()
  }

  advance() {
    clearInterval(this.timer)
    this.metronome.stop()
    if (this.index + 1 >= this.segmentsValue.length) {
      this.finish()
      return
    }
    this.chime()
    this.index += 1
    this.remainingMs = this.currentSegment.seconds * 1000
    this.showSegment()
    if (this.state === "running") {
      this.endAt = performance.now() + this.remainingMs
      this.timer = setInterval(() => this.tick(), 250)
      if (this.currentSegment.kind === "tab_practice") {
        this.metronome.setBpm(this.currentSegment.bpm)
        this.metronome.setMeter(this.currentSegment.beats)
        this.metronome.start()
      }
    }
    this.render()
    this.renderClock()
  }

  finish() {
    this.state = "done"
    this.remainingMs = 0
    this.chime(true)
    this.segmentTargets.forEach(el => el.classList.remove("active"))
    this.releaseWakeLock()
    this.render()
    this.renderClock()
  }

  chime(final = false) {
    if (!this.audioContext) return
    const notes = final ? [659.25, 880, 1318.5] : [659.25, 880]
    notes.forEach((frequency, i) => {
      const time = this.audioContext.currentTime + i * 0.18
      const osc = this.audioContext.createOscillator()
      const gain = this.audioContext.createGain()
      osc.frequency.value = frequency
      gain.gain.setValueAtTime(0.25, time)
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4)
      osc.connect(gain).connect(this.audioContext.destination)
      osc.start(time)
      osc.stop(time + 0.45)
    })
  }

  showSegment() {
    this.segmentTargets.forEach((el, i) => el.classList.toggle("active", i === this.index))
    this.paneTargets.forEach((el, i) => { el.hidden = i !== this.index })
  }

  render() {
    const labels = { idle: "Start", running: "Pause", paused: "Start", done: "Start again" }
    this.toggleTarget.textContent = labels[this.state]
    if (this.state === "done") {
      this.statusTarget.textContent = "¡Olé! Practice complete."
    } else {
      const state = this.state === "paused" ? " · paused" : ""
      this.statusTarget.textContent =
        `${this.currentSegment.label} · segment ${this.index + 1} of ${this.segmentsValue.length}${state}`
    }
  }

  renderClock() {
    const total = Math.ceil(this.remainingMs / 1000)
    const minutes = Math.floor(total / 60)
    const seconds = total % 60
    this.clockTarget.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
  }

  async requestWakeLock() {
    try {
      this.wakeLock = await navigator.wakeLock?.request("screen")
    } catch {
      // Screen may still sleep; practice goes on.
    }
  }

  releaseWakeLock() {
    this.wakeLock?.release()
    this.wakeLock = null
  }
}
