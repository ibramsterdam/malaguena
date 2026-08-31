import { Controller } from "@hotwired/stimulus"

// Drift-free metronome: clicks are scheduled slightly ahead on the Web Audio
// clock (setInterval only tops up the queue, so its jitter never reaches the
// ear). Each click also dispatches a window-level "metronome:beat" event that
// the tab playhead follows.
export default class extends Controller {
  static targets = ["bpm", "slider", "toggle", "dot"]
  static values = { bpm: { type: Number, default: 80 }, beatsPerBar: { type: Number, default: 4 } }

  static LOOKAHEAD_MS = 25
  static SCHEDULE_AHEAD_S = 0.1

  connect() {
    this.running = false
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
    this.running = true
    this.render()
  }

  stop() {
    clearInterval(this.timer)
    this.running = false
    if (this.hasDotTarget) this.dotTargets.forEach(dot => dot.classList.remove("hit"))
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
    if (!this.hasDotTarget) return
    this.dotTargets.forEach((dot, index) => {
      dot.classList.toggle("hit", index === beat % this.beatsPerBarValue)
    })
  }

  nudge(event) {
    this.setBpm(this.bpmValue + Number(event.params.amount))
  }

  slide() {
    this.setBpm(Number(this.sliderTarget.value))
  }

  setBpm(bpm) {
    this.bpmValue = Math.min(240, Math.max(30, bpm))
    this.render()
  }

  render() {
    if (this.hasBpmTarget) this.bpmTarget.textContent = this.bpmValue
    if (this.hasSliderTarget) this.sliderTarget.value = this.bpmValue
    if (this.hasToggleTarget) this.toggleTarget.textContent = this.running ? "Stop" : "Start"
  }
}
