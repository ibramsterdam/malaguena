import { Controller } from "@hotwired/stimulus"

// Nested segment rows for the routine form: add from a template, remove
// by flagging _destroy, reorder with the arrows. Positions renumber on
// every change so the server saves the visible order.
export default class extends Controller {
  static targets = ["rows", "template", "row", "destroy"]

  connect() {
    this.renumber()
  }

  add() {
    const html = this.templateTarget.innerHTML.replaceAll("NEW_RECORD", String(Date.now()))
    this.rowsTarget.insertAdjacentHTML("beforeend", html)
    this.renumber()
  }

  remove(event) {
    const row = event.target.closest("[data-segments-editor-target='row']")
    const persisted = row.querySelector("input[name*='[id]']")
    if (persisted) {
      row.querySelector("[data-segments-editor-target='destroy']").value = "1"
      row.hidden = true
    } else {
      row.remove()
    }
    this.renumber()
  }

  up(event) {
    this.shift(event, -1)
  }

  down(event) {
    this.shift(event, 1)
  }

  shift(event, direction) {
    const row = event.target.closest("[data-segments-editor-target='row']")
    const rows = this.visibleRows()
    const index = rows.indexOf(row)
    const swap = rows[index + direction]
    if (!swap) return
    if (direction < 0) swap.before(row)
    else swap.after(row)
    this.renumber()
  }

  visibleRows() {
    return this.rowTargets.filter(row => !row.hidden)
  }

  renumber() {
    this.visibleRows().forEach((row, index) => {
      const position = row.querySelector("input[name*='[position]']")
      if (position) position.value = index + 1
    })
  }
}
