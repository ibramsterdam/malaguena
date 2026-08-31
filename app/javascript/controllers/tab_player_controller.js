import { Controller } from "@hotwired/stimulus"

// Walks an amber playhead through an ASCII tab, one note column per
// metronome beat. ASCII tab carries no rhythm, so every column of fret
// numbers counts as one beat — right for steady arpeggio studies.
export default class extends Controller {
  static targets = ["sheet"]

  connect() {
    this.columns = this.parse(this.sheetTarget.textContent)
    this.pointer = -1
    this.onBeat = () => this.advance()
    window.addEventListener("metronome:beat", this.onBeat)
    this.playhead = document.createElement("span")
    this.playhead.className = "tab-playhead"
    this.playhead.hidden = true
    this.sheetTarget.appendChild(this.playhead)
  }

  disconnect() {
    window.removeEventListener("metronome:beat", this.onBeat)
  }

  // Finds the systems (groups of consecutive string lines) and, within each,
  // the character columns where at least one string carries a fret number.
  // Adjacent digit columns are one note (fret 10+ spans two characters).
  parse(text) {
    const lines = text.split("\n")
    const columns = []
    let system = null

    lines.forEach((line, lineIndex) => {
      const isStringLine = /^[A-Ga-g]?\|/.test(line)
      if (isStringLine && !system) system = { start: lineIndex, lines: [] }
      if (!isStringLine && system) system = this.flush(system, columns)
      if (system) system.lines.push(line)
    })
    this.flush(system, columns)
    return columns
  }

  flush(system, columns) {
    if (!system) return null
    const width = Math.max(...system.lines.map(line => line.length))
    let previousHadNote = false
    for (let column = 0; column < width; column++) {
      const hasNote = system.lines.some(line => /\d/.test(line[column] || ""))
      if (hasNote && !previousHadNote) {
        columns.push({ row: system.start, height: system.lines.length, column })
      }
      previousHadNote = hasNote
    }
    return null
  }

  advance() {
    if (this.columns.length === 0) return
    if (this.element.offsetParent === null) return // hidden pane, not our beat
    this.pointer = (this.pointer + 1) % this.columns.length
    this.moveTo(this.columns[this.pointer])
  }

  moveTo(note) {
    this.playhead.hidden = false
    this.playhead.style.left = `${note.column}ch`
    this.playhead.style.top = `calc(${note.row} * 1.6em)`
    this.playhead.style.height = `calc(${note.height} * 1.6em)`
    const container = this.element
    const target = this.playhead.offsetLeft - container.clientWidth / 2
    container.scrollTo({ left: Math.max(0, target), behavior: "smooth" })
  }
}
