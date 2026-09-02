import { Controller } from "@hotwired/stimulus"

// Drift-free metronome: clicks are scheduled slightly ahead on the Web Audio
// clock (setInterval only tops up the queue, so its jitter never reaches the
// ear). Each click also dispatches a window-level "metronome:beat" event that
// the tab playhead follows.
export default class extends Controller {
  static targets = ["bpm", "slider", "toggle", "dots", "marking", "markingRow", "timerInput", "timerDisplay", "beatButton", "accent"]
  static values = {
    bpm: { type: Number, default: 80 },
    beatsPerBar: { type: Number, default: 4 },
    accent: { type: Boolean, default: true },
    countIn: { type: Boolean, default: false }
  }

  static LOOKAHEAD_MS = 25
  static SCHEDULE_AHEAD_S = 0.1

  static MARKINGS = [
    { name: "Grave", min: 30, max: 44 },
    { name: "Largo", min: 45, max: 59 },
    { name: "Larghetto", min: 60, max: 65 },
    { name: "Adagio", min: 66, max: 75 },
    { name: "Andante", min: 76, max: 107 },
    { name: "Moderato", min: 108, max: 119 },
    { name: "Allegro", min: 120, max: 155 },
    { name: "Vivace", min: 156, max: 167 },
    { name: "Presto", min: 168, max: 199 },
    { name: "Prestissimo", min: 200, max: 240 }
  ]

  connect() {
    this.running = false
    this.taps = []
    this.onBreather = () => this.breather(5)
    window.addEventListener("tab:breather", this.onBreather)
    this.renderDots()
    this.render()
  }

  disconnect() {
    window.removeEventListener("tab:breather", this.onBreather)
    this.stop()
  }

  // The piece wrapped back to the top: hold the clicks for a few seconds
  // with a visible countdown, then come back in on a fresh downbeat.
  breather(seconds) {
    if (!this.running) return
    clearInterval(this.timer)
    clearInterval(this.breatherTimer)
    this.showCountOverlay()
    let left = seconds
    this.updateCount(left)
    this.breatherTimer = setInterval(() => {
      left -= 1
      if (left > 0) {
        this.updateCount(left)
        return
      }
      clearInterval(this.breatherTimer)
      this.hideCountOverlay()
      this.beat = 0
      this.nextBeatTime = this.audioContext.currentTime + 0.08
      this.timer = setInterval(() => this.schedule(), this.constructor.LOOKAHEAD_MS)
    }, 1000)
  }

  toggle() {
    this.running ? this.stop() : this.start()
  }

  start() {
    if (this.running) return
    this.audioContext ||= new (window.AudioContext || window.webkitAudioContext)()
    this.audioContext.resume()
    // With a count-in, one silent-playhead bar of softer clicks (negative
    // beats) runs before beat zero.
    this.beat = this.countInValue ? -this.beatsPerBarValue : 0
    if (this.countInValue) this.showCountOverlay()
    this.nextBeatTime = this.audioContext.currentTime + 0.08
    this.timer = setInterval(() => this.schedule(), this.constructor.LOOKAHEAD_MS)
    this.startCountdown()
    this.running = true
    this.render()
  }

  stop() {
    clearInterval(this.timer)
    clearInterval(this.countdown)
    clearInterval(this.breatherTimer)
    this.countdown = null
    this.hideCountOverlay()
    this.running = false
    if (this.hasDotsTarget) [...this.dotsTarget.children].forEach(dot => dot.classList.remove("hit"))
    this.render()
  }

  schedule() {
    while (this.nextBeatTime < this.audioContext.currentTime + this.constructor.SCHEDULE_AHEAD_S) {
      this.click(this.beat, this.nextBeatTime)
      this.announce(this.beat, this.nextBeatTime)
      this.nextBeatTime += 60.0 / this.bpmValue
      this.beat += 1
    }
  }

  toggleAccent() {
    this.accentValue = !this.accentValue
    this.render()
  }

  click(beat, time) {
    const countIn = beat < 0
    const accent = !countIn && this.accentValue && beat % this.beatsPerBarValue === 0
    const osc = this.audioContext.createOscillator()
    const gain = this.audioContext.createGain()
    osc.frequency.value = countIn ? 700 : accent ? 1244 : 932
    gain.gain.setValueAtTime(countIn ? 0.22 : accent ? 0.5 : 0.32, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05)
    osc.connect(gain).connect(this.audioContext.destination)
    osc.start(time)
    osc.stop(time + 0.06)
  }

  // Fire the visual/beat event at the moment the click actually sounds.
  announce(beat, time) {
    const delay = Math.max(0, (time - this.audioContext.currentTime) * 1000)
    setTimeout(() => {
      if (!this.running) return
      if (beat < 0) {
        this.updateCount(-beat)
        return
      }
      this.hideCountOverlay()
      window.dispatchEvent(new CustomEvent("metronome:beat", { detail: { beat, bpm: this.bpmValue } }))
      this.flash(beat)
    }, delay)
  }

  // ----- count-in overlay -----

  showCountOverlay() {
    this.hideCountOverlay()
    this.countOverlay = document.createElement("div")
    this.countOverlay.className = "count-in"
    document.body.appendChild(this.countOverlay)
  }

  updateCount(number) {
    if (!this.countOverlay) return
    this.countOverlay.textContent = number
    this.countOverlay.animate(
      [{ opacity: 1, transform: "scale(1.2)" }, { opacity: 0.75, transform: "scale(1)" }],
      { duration: 280, easing: "ease-out" }
    )
  }

  hideCountOverlay() {
    this.countOverlay?.remove()
    this.countOverlay = null
  }

  flash(beat) {
    if (!this.hasDotsTarget) return
    ;[...this.dotsTarget.children].forEach((dot, index) => {
      dot.classList.toggle("hit", index === beat % this.beatsPerBarValue)
    })
  }

  // ----- tempo -----

  nudge(event) {
    this.setBpm(this.bpmValue + Number(event.params.amount))
  }

  slide() {
    this.setBpm(Number(this.sliderTarget.value))
  }

  tap() {
    const now = performance.now()
    if (this.taps.length && now - this.taps.at(-1) > 2000) this.taps = []
    this.taps.push(now)
    if (this.taps.length < 2) return
    const recent = this.taps.slice(-7)
    const interval = (recent.at(-1) - recent[0]) / (recent.length - 1)
    this.setBpm(Math.round(60000 / interval))
  }

  setBpm(bpm) {
    this.bpmValue = Math.min(240, Math.max(30, bpm))
    this.render()
  }

  marking() {
    return this.constructor.MARKINGS.find(m => this.bpmValue >= m.min && this.bpmValue <= m.max)
  }

  // ----- beats per bar -----

  setBeats(event) {
    this.setMeter(Number(event.params.count))
  }

  setMeter(count) {
    this.beatsPerBarValue = count
    this.renderDots()
    this.render()
  }

  renderDots() {
    if (!this.hasDotsTarget) return
    this.dotsTarget.replaceChildren(
      ...Array.from({ length: this.beatsPerBarValue }, () => document.createElement("i"))
    )
  }

  // ----- timer -----

  startCountdown() {
    if (!this.hasTimerInputTarget) return
    const minutes = Number(this.timerInputTarget.value)
    if (!minutes || minutes <= 0) {
      if (this.hasTimerDisplayTarget) this.timerDisplayTarget.textContent = ""
      return
    }
    this.timerEndAt = performance.now() + minutes * 60000
    this.countdown = setInterval(() => {
      const left = this.timerEndAt - performance.now()
      if (left <= 0) {
        this.stop()
        this.timerDisplayTarget.textContent = "Time!"
        return
      }
      const total = Math.ceil(left / 1000)
      this.timerDisplayTarget.textContent =
        `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")} left`
    }, 250)
  }

  // ----- rendering -----

  render() {
    if (this.hasBpmTarget) this.bpmTarget.textContent = this.bpmValue
    if (this.hasSliderTarget) this.sliderTarget.value = this.bpmValue
    if (this.hasToggleTarget) this.toggleTarget.textContent = this.running ? "Pause" : "Start"
    if (this.hasMarkingTarget) this.markingTarget.textContent = this.marking()?.name ?? ""
    if (this.hasAccentTarget) {
      this.accentTarget.classList.toggle("active", this.accentValue)
      this.accentTarget.setAttribute("aria-pressed", String(this.accentValue))
    }
    if (this.hasBeatButtonTarget) {
      this.beatButtonTargets.forEach(button => {
        button.classList.toggle("active", Number(button.dataset.metronomeCountParam) === this.beatsPerBarValue)
      })
    }
    if (this.hasMarkingRowTarget) {
      this.markingRowTargets.forEach(row => {
        const active = this.bpmValue >= Number(row.dataset.min) && this.bpmValue <= Number(row.dataset.max)
        row.classList.toggle("active", active)
      })
    }
  }
}
