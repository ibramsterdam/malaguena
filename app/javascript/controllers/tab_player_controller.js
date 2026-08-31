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
    this.originalText = this.sheetTarget.textContent

    this.onBeat = event => this.advance(event.detail.beat)
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

    this.onResize = () => {
      clearTimeout(this.resizeTimer)
      this.resizeTimer = setTimeout(() => this.rebuild(), 250)
    }
    window.addEventListener("resize", this.onResize)

    this.rebuild()
  }

  disconnect() {
    window.removeEventListener("metronome:beat", this.onBeat)
    window.removeEventListener("tab:back", this.onBack)
    window.removeEventListener("tab:forward", this.onForward)
    window.removeEventListener("tab:restart", this.onRestart)
    window.removeEventListener("tab:clearloop", this.onClearLoop)
    window.removeEventListener("resize", this.onResize)
    this.sheetTarget.removeEventListener("click", this.onClick)
    clearTimeout(this.resizeTimer)
    cancelAnimationFrame(this.glideX)
    cancelAnimationFrame(this.glideY)
  }

  // Reflow the tab to the current width, then parse it fresh. Runs on
  // connect and again when the viewport is resized; playback restarts
  // from the top because every column index changes with the wrapping.
  rebuild() {
    this.systems = []
    const text = this.reflow(this.originalText)
    this.sheetTarget.textContent = text
    this.columns = this.parse(text)
    this.pointer = -1
    this.currentRow = null
    this.loop = null
    this.pendingA = null
    this.loopEls = []

    this.playhead = document.createElement("span")
    this.playhead.className = "tab-playhead"
    this.playhead.hidden = true
    this.sheetTarget.appendChild(this.playhead)
    this.renderLoop()
  }

  // ----- reflow: re-wrap systems at barlines so they fit the screen -----

  // Phones can't read a four-bar system; sideways scrolling through music
  // is worse. Split every system at its barlines and deal out as many bars
  // per line as the container can hold, like a typesetter would.
  reflow(text) {
    const maxChars = this.availableChars()
    const out = []
    let system = []
    const flushSystem = () => {
      if (system.length === 0) return
      this.wrapSystem(system, maxChars).forEach((group, index) => {
        if (index > 0) out.push("")
        out.push(...group)
      })
      system = []
    }
    text.split("\n").forEach(line => {
      if (/^[A-Ga-g]?\|/.test(line)) {
        system.push(line)
      } else {
        flushSystem()
        out.push(...this.wrapText(line, maxChars))
      }
    })
    flushSystem()
    return out.join("\n")
  }

  // Prose lines (section labels, instructions) word-wrap to the same
  // width budget as the music, so they can't force a sideways scroll.
  wrapText(line, maxChars) {
    if (line.length <= maxChars) return [line]
    const rows = []
    let current = ""
    line.split(" ").forEach(word => {
      if (current && current.length + 1 + word.length > maxChars) {
        rows.push(current)
        current = word
      } else {
        current = current ? `${current} ${word}` : word
      }
    })
    if (current) rows.push(current)
    return rows
  }

  wrapSystem(lines, maxChars) {
    const width = Math.max(...lines.map(line => line.length))
    const padded = lines.map(line => line.padEnd(width))
    const ref = padded[0]
    const labelEnd = ref.indexOf("|") + 1
    if (labelEnd === 0) return [lines]

    const bars = []
    let start = labelEnd
    for (let i = labelEnd; i < width; i++) {
      if (ref[i] === "|") {
        bars.push([start, i + 1])
        start = i + 1
      }
    }
    if (start < width && ref.slice(start).trim() !== "") bars.push([start, width])
    if (bars.length === 0) return [lines]

    const groups = []
    let current = []
    let currentWidth = labelEnd
    bars.forEach(bar => {
      const barWidth = bar[1] - bar[0]
      if (current.length > 0 && currentWidth + barWidth > maxChars) {
        groups.push(current)
        current = []
        currentWidth = labelEnd
      }
      current.push(bar)
      currentWidth += barWidth
    })
    if (current.length > 0) groups.push(current)

    return groups.map(group =>
      padded.map(line => line.slice(0, labelEnd) + group.map(([from, to]) => line.slice(from, to)).join(""))
    )
  }

  availableChars() {
    // A hidden routine pane has no width of its own; borrow the nearest
    // visible ancestor's.
    let host = this.element
    while (host && host.clientWidth === 0) host = host.parentElement
    const hostWidth = host ? host.clientWidth : 600
    const style = getComputedStyle(this.element)
    const inner = hostWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0)
    return Math.max(20, Math.floor(inner / this.charWidth()))
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
    for (let column = 0; column < width; column++) {
      const hasNote = system.lines.some(line => /\d/.test(line[column] || ""))
      if (hasNote && !previousHadNote) {
        columns.push({ row: system.start, height: system.lines.length, column })
      }
      previousHadNote = hasNote
    }
    return null
  }

  // ----- playback -----

  advance(beat) {
    if (this.columns.length === 0) return
    if (this.element.offsetParent === null) return // hidden pane, not our beat
    let next
    if (beat === 0) {
      // The first beat after a (count-in and) start strikes the note the
      // playhead is already showing, not the one after it.
      next = Math.max(0, this.pointer)
    } else {
      next = this.pointer + 1
      if (this.loop && next > this.loop.b) next = this.loop.a
      if (next >= this.columns.length) next = this.loop ? this.loop.a : 0
    }
    this.pointer = next
    this.moveTo(this.columns[this.pointer])
  }

  jumpTo(index) {
    this.pointer = index
    this.moveTo(this.columns[index])
  }

  // Transport events reach every tab player on the page; only the one
  // whose pane is showing may answer.
  get hidden() {
    return this.columns.length === 0 || this.element.offsetParent === null
  }

  back() {
    if (this.hidden) return
    this.jumpTo(Math.max(0, this.pointer - 1))
  }

  forward() {
    if (this.hidden) return
    this.jumpTo(Math.min(this.columns.length - 1, this.pointer + 1))
  }

  restart() {
    if (this.hidden) return
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

  // Measured on the body with the sheet's font, so it works even while
  // the sheet sits in a hidden routine pane.
  charWidth() {
    const probe = document.createElement("span")
    probe.textContent = "0"
    probe.style.cssText = `visibility: hidden; position: absolute; font: ${getComputedStyle(this.sheetTarget).font};`
    document.body.appendChild(probe)
    const width = probe.getBoundingClientRect().width || 8
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
    if (this.hidden) return
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
    const left = this.playhead.offsetLeft - container.clientWidth / 2
    this.animateScroll("glideX", container.scrollLeft, Math.max(0, left), 300,
      value => { container.scrollLeft = value })
    if (note.row !== this.currentRow) {
      this.currentRow = note.row
      this.scrollToPlayhead()
    }
  }

  // Hands are on the guitar: when the playhead lands on a new system, bring
  // that system into the middle on its own. A sheet capped in height (the
  // routine player) scrolls within itself; a full-page sheet scrolls the
  // window instead.
  scrollToPlayhead() {
    const container = this.element
    const rect = this.playhead.getBoundingClientRect()
    if (container.scrollHeight > container.clientHeight + 4) {
      const box = container.getBoundingClientRect()
      const top = container.scrollTop + (rect.top - box.top) - (container.clientHeight - rect.height) / 2
      this.animateScroll("glideY", container.scrollTop, Math.max(0, top), 800,
        value => { container.scrollTop = value })
    } else {
      const barHeight = document.querySelector(".play-bar")?.offsetHeight ?? 0
      const visible = window.innerHeight - barHeight
      const top = rect.top + window.scrollY - (visible - rect.height) / 2
      this.animateScroll("glideY", window.scrollY, Math.max(0, top), 800,
        value => window.scrollTo(0, value))
    }
  }

  // The browser's own smooth scroll is a quick ~300ms lurch that also fights
  // concurrent programmatic scrolling, so both axes run through this eased
  // animator — each on its own handle, so a page turn and the per-beat
  // horizontal drift never cancel each other.
  animateScroll(handle, from, to, duration, apply) {
    cancelAnimationFrame(this[handle])
    if (Math.abs(to - from) < 2) return
    const startedAt = performance.now()
    const ease = t => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
    const step = now => {
      const progress = Math.min(1, (now - startedAt) / duration)
      apply(from + (to - from) * ease(progress))
      if (progress < 1) this[handle] = requestAnimationFrame(step)
    }
    this[handle] = requestAnimationFrame(step)
  }
}
