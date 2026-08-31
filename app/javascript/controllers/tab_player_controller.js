import { Controller } from "@hotwired/stimulus"

// Walks an amber playhead through an ASCII tab, one note column per
// metronome beat. ASCII tab carries no rhythm, so every column of fret
// numbers counts as one beat — right for steady arpeggio studies.
//
// Transport arrives as window events from the play bar (tab:back,
// tab:forward, tab:restart, tab:clearloop), and clicking the sheet twice
// sets an A–B loop: the playhead cycles the tinted passage until cleared.
export default class extends Controller {
  static targets = ["sheet"]

  connect() {
    this.systems = []
    this.columns = this.parse(this.sheetTarget.textContent)
    this.barIndexes = this.columns.flatMap((note, index) => (note.barStart ? [index] : []))
    this.pointer = -1
    this.currentRow = null
    this.loop = null
    this.pendingA = null
    this.loopEls = []

    this.onBeat = () => this.advance()
    this.onBack = () => this.back()
    this.onForward = () => this.forward()
    this.onRestart = () => this.restart()
    this.onClearLoop = () => this.clearLoop()
    window.addEventListener("metronome:beat", this.onBeat)
    window.addEventListener("tab:back", this.onBack)
    window.addEventListener("tab:forward", this.onForward)
    window.addEventListener("tab:restart", this.onRestart)
    window.addEventListener("tab:clearloop", this.onClearLoop)

    this.onClick = event => this.pick(event)
    this.sheetTarget.addEventListener("click", this.onClick)

    this.playhead = document.createElement("span")
    this.playhead.className = "tab-playhead"
    this.playhead.hidden = true
    this.sheetTarget.appendChild(this.playhead)
  }

  disconnect() {
    window.removeEventListener("metronome:beat", this.onBeat)
    window.removeEventListener("tab:back", this.onBack)
    window.removeEventListener("tab:forward", this.onForward)
    window.removeEventListener("tab:restart", this.onRestart)
    window.removeEventListener("tab:clearloop", this.onClearLoop)
    this.sheetTarget.removeEventListener("click", this.onClick)
    cancelAnimationFrame(this.glide)
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
    this.systems.push({ row: system.start, height: system.lines.length, width })
    let previousHadNote = false
    let sawBar = false
    for (let column = 0; column < width; column++) {
      if (system.lines.some(line => line[column] === "|")) sawBar = true
      const hasNote = system.lines.some(line => /\d/.test(line[column] || ""))
      if (hasNote && !previousHadNote) {
        columns.push({ row: system.start, height: system.lines.length, column, barStart: sawBar })
        sawBar = false
      }
      previousHadNote = hasNote
    }
    return null
  }

  // ----- playback -----

  advance() {
    if (this.columns.length === 0) return
    if (this.element.offsetParent === null) return // hidden pane, not our beat
    let next = this.pointer + 1
    if (this.loop && next > this.loop.b) next = this.loop.a
    if (next >= this.columns.length) next = this.loop ? this.loop.a : 0
    this.pointer = next
    this.moveTo(this.columns[this.pointer])
  }

  jumpTo(index) {
    this.pointer = index
    this.moveTo(this.columns[index])
  }

  back() {
    if (this.columns.length === 0) return
    const current = Math.max(0, this.pointer)
    let target = 0
    for (const index of this.barIndexes) {
      if (index < current) target = index
      else break
    }
    this.jumpTo(target)
  }

  forward() {
    if (this.columns.length === 0) return
    const target = this.barIndexes.find(index => index > this.pointer)
    this.jumpTo(target ?? (this.loop ? this.loop.a : 0))
  }

  restart() {
    if (this.columns.length === 0) return
    this.jumpTo(this.loop ? this.loop.a : 0)
  }

  // ----- A–B loop -----

  pick(event) {
    if (this.columns.length === 0) return
    const rect = this.sheetTarget.getBoundingClientRect()
    const style = getComputedStyle(this.sheetTarget)
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.6
    const col = (event.clientX - rect.left) / this.charWidth()
    const line = Math.floor((event.clientY - rect.top) / lineHeight)

    let best = null
    this.columns.forEach((note, index) => {
      if (line < note.row || line >= note.row + note.height) return
      const distance = Math.abs(note.column - col)
      if (!best || distance < best.distance) best = { index, distance }
    })
    if (best) this.setLoopPoint(best.index)
  }

  charWidth() {
    const probe = document.createElement("span")
    probe.textContent = "0"
    probe.style.visibility = "hidden"
    this.sheetTarget.appendChild(probe)
    const width = probe.getBoundingClientRect().width
    probe.remove()
    return width
  }

  setLoopPoint(index) {
    if (this.pendingA === null && !this.loop) {
      this.pendingA = index
    } else if (this.pendingA !== null) {
      const [a, b] = [Math.min(this.pendingA, index), Math.max(this.pendingA, index)]
      this.loop = { a, b }
      this.pendingA = null
      this.jumpTo(a)
    } else {
      // A loop already stands: this click begins a fresh selection.
      this.loop = null
      this.pendingA = index
    }
    this.renderLoop()
  }

  clearLoop() {
    this.loop = null
    this.pendingA = null
    this.renderLoop()
  }

  renderLoop() {
    this.loopEls.forEach(el => el.remove())
    this.loopEls = []
    window.dispatchEvent(new CustomEvent("tab:loopchange", {
      detail: { active: !!this.loop || this.pendingA !== null }
    }))

    const marks = []
    if (this.pendingA !== null) {
      const note = this.columns[this.pendingA]
      marks.push({ row: note.row, height: note.height, left: note.column, width: 0.6 })
    }
    if (this.loop) {
      const a = this.columns[this.loop.a]
      const b = this.columns[this.loop.b]
      const from = this.systems.findIndex(s => s.row === a.row)
      const to = this.systems.findIndex(s => s.row === b.row)
      for (let s = from; s <= to; s++) {
        const system = this.systems[s]
        const left = s === from ? a.column : 2
        const right = s === to ? b.column + 1 : system.width
        marks.push({ row: system.row, height: system.height, left, width: Math.max(1, right - left) })
      }
    }

    marks.forEach(mark => {
      const el = document.createElement("i")
      el.className = "tab-loop"
      el.style.left = `${mark.left}ch`
      el.style.width = `${mark.width}ch`
      el.style.top = `calc(${mark.row} * 1.6em)`
      el.style.height = `calc(${mark.height} * 1.6em)`
      this.sheetTarget.insertBefore(el, this.playhead)
      this.loopEls.push(el)
    })
  }

  // ----- rendering -----

  moveTo(note) {
    this.playhead.hidden = false
    this.playhead.style.left = `${note.column}ch`
    this.playhead.style.top = `calc(${note.row} * 1.6em)`
    this.playhead.style.height = `calc(${note.height} * 1.6em)`
    const container = this.element
    const target = this.playhead.offsetLeft - container.clientWidth / 2
    container.scrollTo({ left: Math.max(0, target), behavior: "smooth" })
    if (note.row !== this.currentRow) {
      this.currentRow = note.row
      this.scrollPageToPlayhead()
    }
  }

  // Hands are on the guitar: when the playhead lands on a new system,
  // bring that system to the middle of the screen on its own.
  scrollPageToPlayhead() {
    const rect = this.playhead.getBoundingClientRect()
    const barHeight = document.querySelector(".play-bar")?.offsetHeight ?? 0
    const visible = window.innerHeight - barHeight
    const top = rect.top + window.scrollY - (visible - rect.height) / 2
    this.glideTo(Math.max(0, top))
  }

  // The browser's own smooth scroll is a quick ~300ms lurch; a longer
  // eased glide keeps the page turn from twitching mid-bar.
  glideTo(target, duration = 800) {
    cancelAnimationFrame(this.glide)
    const from = window.scrollY
    const distance = target - from
    if (Math.abs(distance) < 2) return
    const startedAt = performance.now()
    const ease = t => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
    const step = now => {
      const progress = Math.min(1, (now - startedAt) / duration)
      window.scrollTo(0, from + distance * ease(progress))
      if (progress < 1) this.glide = requestAnimationFrame(step)
    }
    this.glide = requestAnimationFrame(step)
  }
}
