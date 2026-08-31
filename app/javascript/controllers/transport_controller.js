import { Controller } from "@hotwired/stimulus"

// The play bar's transport buttons speak to the tab player over window
// events, the same channel the metronome beat uses. The clear-loop button
// only shows itself while a loop (or a pending loop point) exists.
export default class extends Controller {
  static targets = ["clear"]

  connect() {
    this.onLoopChange = event => {
      if (this.hasClearTarget) this.clearTarget.hidden = !event.detail.active
    }
    window.addEventListener("tab:loopchange", this.onLoopChange)
  }

  disconnect() {
    window.removeEventListener("tab:loopchange", this.onLoopChange)
  }

  send(event) {
    window.dispatchEvent(new CustomEvent(`tab:${event.params.action}`))
  }
}
