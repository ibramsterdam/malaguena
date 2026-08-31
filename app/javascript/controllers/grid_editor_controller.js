import { Controller } from "@hotwired/stimulus"

// The fret grid: tabs are edited as beat cells on six strings, and the
// ASCII is generated output. Blocks are either a bar (6 strings × beats)
// or a section label; the whole document serializes into the form's
// hidden body field on every change.
export default class extends Controller {
  static targets = ["body", "canvas", "preview", "beats", "importPanel", "importText"]

  static STRINGS = ["e", "B", "G", "D", "A", "E"]

  connect() {
    this.beatsPerBar = 4
    this.blocks = this.parse(this.bodyTarget.value)
    if (this.blocks.some(block => block.type === "bar")) {
      const first = this.blocks.find(block => block.type === "bar")
      this.beatsPerBar = first.beats
    } else if (this.blocks.length === 0) {
      this.blocks = [this.newBar()]
    }
    this.selection = null
    this.render()
  }

  // ----- model -----

  newBar() {
    return {
      type: "bar",
      beats: this.beatsPerBar,
      cells: this.constructor.STRINGS.map(() => Array(this.beatsPerBar).fill(""))
    }
  }

  // Parse ASCII into blocks. Systems become runs of bars; note columns map
  // onto beats in order (silent beats in imported tabs can't always be
  // recovered — the grid is the source of truth from here on).
  parse(text) {
    const blocks = []
    let system = []
    const flush = () => {
      if (system.length === 0) return
      this.systemToBars(system).forEach(bar => blocks.push(bar))
      system = []
    }
    ;(text || "").split("\n").forEach(line => {
      if (/^[A-Ga-g]?\|/.test(line)) {
        system.push(line)
      } else {
        flush()
        const trimmed = line.trim()
        if (trimmed !== "") blocks.push({ type: "label", text: trimmed.replace(/^\[|\]$/g, "") })
      }
    })
    flush()
    return blocks
  }

  systemToBars(lines) {
    const width = Math.max(...lines.map(line => line.length))
    const padded = lines.map(line => line.padEnd(width))
    const labelEnd = padded[0].indexOf("|") + 1
    const cuts = [labelEnd - 1]
    for (let i = labelEnd; i < width; i++) if (padded[0][i] === "|") cuts.push(i)

    const bars = []
    for (let c = 0; c < cuts.length - 1; c++) {
      const from = cuts[c] + 1
      const to = cuts[c + 1]
      const columns = []
      let previous = false
      for (let i = from; i < to; i++) {
        const hasNote = padded.some(line => /\d/.test(line[i]))
        if (hasNote && !previous) columns.push(i)
        previous = hasNote
      }
      const beats = Math.max(columns.length, this.beatsPerBar)
      const cells = this.constructor.STRINGS.map(() => Array(beats).fill(""))
      columns.forEach((column, beat) => {
        padded.forEach((line, string) => {
          const match = line.slice(column, to).match(/^\d+/)
          if (match) cells[string][beat] = match[0]
        })
      })
      bars.push({ type: "bar", beats, cells })
    }
    return bars
  }

  // Serialize blocks back to ASCII: consecutive bars form one system, and
  // every beat is a fixed-width cell so alignment is guaranteed.
  serialize() {
    const out = []
    let run = []
    const flushRun = () => {
      if (run.length === 0) return
      this.constructor.STRINGS.forEach((name, string) => {
        const line = run.map(bar => {
          const width = Math.max(4, ...bar.cells.flat().map(fret => fret.length + 2))
          return bar.cells[string].map(fret => `-${fret}${"-".repeat(width - 1 - fret.length)}`).join("")
        }).join("|")
        out.push(`${name}|${line}|`)
      })
      out.push("")
      run = []
    }
    this.blocks.forEach(block => {
      if (block.type === "bar") {
        run.push(block)
      } else {
        flushRun()
        out.push(`[${block.text}]`)
        out.push("")
      }
    })
    flushRun()
    return out.join("\n").replace(/\n+$/, "") + "\n"
  }

  sync() {
    const ascii = this.serialize()
    this.bodyTarget.value = ascii
    if (this.hasPreviewTarget) this.previewTarget.textContent = ascii
  }

  // ----- actions -----

  setBeats(event) {
    this.beatsPerBar = Number(event.params.count)
    this.render()
  }

  addBar(event, afterIndex = null) {
    const index = afterIndex ?? this.blocks.length
    this.blocks.splice(index, 0, this.newBar())
    this.selection = { block: index, string: 0, beat: 0 }
    this.render()
  }

  addLabel() {
    const text = window.prompt("Section label", "Chorus")
    if (!text) return
    this.blocks.push({ type: "label", text })
    this.render()
  }

  toggleImport() {
    this.importPanelTarget.hidden = !this.importPanelTarget.hidden
  }

  importAscii() {
    const text = this.importTextTarget.value
    if (text.trim() === "") return
    this.blocks = this.parse(text)
    this.selection = null
    this.importPanelTarget.hidden = true
    this.render()
  }

  // ----- selection and input -----

  select(block, string, beat) {
    this.selection = { block, string, beat }
    this.render()
  }

  keydown(event) {
    if (!this.selection) return
    const { key } = event
    if (/^[0-9]$/.test(key)) {
      const cell = this.cell()
      const current = cell.value
      const appended = current + key
      const value = current !== "" && Number(appended) <= 24 && current.length < 2 ? appended : key
      this.setCell(value)
      event.preventDefault()
    } else if (key === "Backspace" || key === "Delete") {
      this.setCell("")
      event.preventDefault()
    } else if (key === "ArrowRight") {
      this.move(0, 1)
      event.preventDefault()
    } else if (key === "ArrowLeft") {
      this.move(0, -1)
      event.preventDefault()
    } else if (key === "ArrowDown") {
      this.move(1, 0)
      event.preventDefault()
    } else if (key === "ArrowUp") {
      this.move(-1, 0)
      event.preventDefault()
    }
  }

  pad(event) {
    if (!this.selection) return
    this.setCell(String(event.params.fret))
  }

  padClear() {
    if (this.selection) this.setCell("")
  }

  padNext() {
    if (this.selection) this.move(0, 1)
  }

  cell() {
    const bar = this.blocks[this.selection.block]
    return { bar, value: bar.cells[this.selection.string][this.selection.beat] }
  }

  setCell(value) {
    const bar = this.blocks[this.selection.block]
    bar.cells[this.selection.string][this.selection.beat] = value
    this.render()
  }

  move(dString, dBeat) {
    let { block, string, beat } = this.selection
    string = Math.min(5, Math.max(0, string + dString))
    beat += dBeat
    const barIndexes = this.blocks.flatMap((b, i) => (b.type === "bar" ? [i] : []))
    let at = barIndexes.indexOf(block)
    while (beat < 0 || beat >= this.blocks[block].beats) {
      if (beat < 0) {
        if (at === 0) { beat = 0; break }
        at -= 1
        block = barIndexes[at]
        beat += this.blocks[block].beats
      } else {
        if (at === barIndexes.length - 1) { beat = this.blocks[block].beats - 1; break }
        beat -= this.blocks[block].beats
        at += 1
        block = barIndexes[at]
      }
    }
    this.selection = { block, string, beat }
    this.render()
  }

  // ----- rendering -----

  render() {
    this.sync()
    if (this.hasBeatsTarget) {
      this.beatsTargets.forEach(button => {
        button.classList.toggle("active", Number(button.dataset.gridEditorCountParam) === this.beatsPerBar)
      })
    }

    const canvas = this.canvasTarget
    canvas.replaceChildren()
    let barNumber = 0

    this.blocks.forEach((block, index) => {
      if (block.type === "label") {
        const chip = document.createElement("div")
        chip.className = "ge-label"
        chip.append(`[${block.text}]`)
        const remove = this.iconButton("✕", "Remove label", () => {
          this.blocks.splice(index, 1)
          this.selection = null
          this.render()
        })
        chip.appendChild(remove)
        canvas.appendChild(chip)
        return
      }

      barNumber += 1
      const wrap = document.createElement("div")
      wrap.className = "ge-bar"

      const head = document.createElement("div")
      head.className = "ge-bar-head"
      head.append(`Bar ${barNumber}`)
      head.appendChild(this.iconButton("⧉", "Duplicate bar", () => {
        this.blocks.splice(index + 1, 0, JSON.parse(JSON.stringify(block)))
        this.render()
      }))
      head.appendChild(this.iconButton("✕", "Remove bar", () => {
        this.blocks.splice(index, 1)
        this.selection = null
        this.render()
      }))
      wrap.appendChild(head)

      const grid = document.createElement("div")
      grid.className = "ge-grid"
      grid.style.gridTemplateColumns = `18px repeat(${block.beats}, 34px)`
      this.constructor.STRINGS.forEach((name, string) => {
        const gutter = document.createElement("span")
        gutter.className = "ge-string"
        gutter.textContent = name
        grid.appendChild(gutter)
        for (let beat = 0; beat < block.beats; beat++) {
          const cell = document.createElement("button")
          cell.type = "button"
          cell.className = "ge-cell"
          const value = block.cells[string][beat]
          if (value !== "") cell.classList.add("filled")
          const selected = this.selection &&
            this.selection.block === index && this.selection.string === string && this.selection.beat === beat
          if (selected) cell.classList.add("selected")
          cell.textContent = value
          cell.addEventListener("click", () => this.select(index, string, beat))
          grid.appendChild(cell)
        }
      })
      wrap.appendChild(grid)
      canvas.appendChild(wrap)
    })

    if (this.selection) this.canvasTarget.focus({ preventScroll: true })
  }

  iconButton(glyph, title, onClick) {
    const button = document.createElement("button")
    button.type = "button"
    button.className = "ge-icon"
    button.title = title
    button.textContent = glyph
    button.addEventListener("click", event => {
      event.stopPropagation()
      onClick()
    })
    return button
  }
}
