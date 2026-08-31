import { Controller } from "@hotwired/stimulus"

// Adds and removes nested segment rows from a <template>.
export default class extends Controller {
  static targets = ["template", "rows"]

  add(event) {
    event.preventDefault()
    const html = this.templateTarget.innerHTML.replaceAll("NEW_RECORD", Date.now().toString())
    this.rowsTarget.insertAdjacentHTML("beforeend", html)
    this.renumber()
  }

  remove(event) {
    event.preventDefault()
    const row = event.target.closest("[data-nested-form-row]")
    const destroyInput = row.querySelector("input[name*='_destroy']")
    if (destroyInput) {
      destroyInput.value = "1"
      row.hidden = true
    } else {
      row.remove()
    }
    this.renumber()
  }

  renumber() {
    let position = 1
    this.rowsTarget.querySelectorAll("[data-nested-form-row]:not([hidden])").forEach(row => {
      row.querySelector("input[name*='[position]']").value = position
      position += 1
    })
  }
}
