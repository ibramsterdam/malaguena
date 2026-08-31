import { Controller } from "@hotwired/stimulus"

// Drift-free metronome: clicks are scheduled slightly ahead on the Web Audio
// clock (setInterval only tops up the queue, so its jitter never reaches the
// ear). Each click also dispatches a window-level "metronome:beat" event that
// the tab playhead follows.
export default class extends Controller {
  static targets = ["bpm", "slider", "toggle", "dots", "marking", "markingRow", "timerInput", "timerDisplay", "beatButton"]
  static values = { bpm: { type: Number, default: 80 }, beatsPerBar: { type: Number, default: 4 } }

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
    this.renderDots()
    this.render()
  }

  disconnect() {
    this.stop()
  }

  toggle() {
    this.running ? this.stop() : this.start()
  }

  start() {
    if (this.running) return
    this.context ||= new (window.AudioContext || window.webkitAudioContext)()
    this.context.resume()
    this.beat = 0
    this.nextBeatTime = this.context.currentTime + 0.08
    this.timer = setInterval(() => this.schedule(), this.constructor.LOOKAHEAD_MS)
    this.startCountdown()
    this.running = true
    this.render()
  }

  stop() {
    clearInterval(this.timer)
    clearInterval(this.countdown)
    this.countdown = null
    this.running = false
    if (this.hasDotsTarget) [...this.dotsTarget.children].forEach(dot => dot.classList.remove("hit"))
    this.render()
  }

  schedule() {
    while (this.nextBeatTime < this.context.currentTime + this.constructor.SCHEDULE_AHEAD_S) {
      this.click(this.beat, this.nextBeatTime)
      this.announce(this.beat, this.nextBeatTime)
      this.nextBeatTime += 60.0 / this.bpmValue
      this.beat += 1
    }
  }

  click(beat, time) {
    const accent = beat % this.beatsPerBarValue === 0
    const osc = this.context.createOscillator()
    const gain = this.context.createGain()
    osc.frequency.value = accent ? 1244 : 932
    gain.gain.setValueAtTime(accent ? 0.5 : 0.32, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05)
    osc.connect(gain).connect(this.context.destination)
    osc.start(time)
    osc.stop(time + 0.06)
  }

  // Fire the visual/beat event at the moment the click actually sounds.
  announce(beat, time) {
    const delay = Math.max(0, (time - this.context.currentTime) * 1000)
    setTimeout(() => {
      if (!this.running) return
      window.dispatchEvent(new CustomEvent("metronome:beat", { detail: { beat, bpm: this.bpmValue } }))
      this.flash(beat)
    }, delay)
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
    this.beatsPerBarValue = Number(event.params.count)
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
    if (this.hasToggleTarget) this.toggleTarget.textContent = this.running ? "Stop" : "Start"
    if (this.hasMarkingTarget) this.markingTarget.textContent = this.marking()?.name ?? ""
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
