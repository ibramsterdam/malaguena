import { Controller } from "@hotwired/stimulus"

// Shows the tab and BPM pickers only when the segment kind needs them.
export default class extends Controller {
  static targets = ["kind", "tabFields"]

  connect() {
    this.refresh()
  }

  refresh() {
    this.tabFieldsTarget.hidden = this.kindTarget.value !== "tab_practice"
  }
}
