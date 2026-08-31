import { Controller } from "@hotwired/stimulus"

// The play bar's transport buttons speak to the tab player over window
// events, the same channel the metronome beat uses. The clear-loop button
// only shows itself while a loop (or a pending loop point) exists.
export default class extends Controller {
  static targets = ["clear"]

  connect() {
    this.onLoopChange = event => {
      if (this.hasClearTarget) this.clearTarget.hidden = !event.detail.active
      this.reportHeight()
    }
    window.addEventListener("tab:loopchange", this.onLoopChange)

    // The bar wraps to more rows on narrow screens; publish its real
    // height so the footer clearance and the sheet budget stay honest.
    this.onResize = () => this.reportHeight()
    window.addEventListener("resize", this.onResize)
    this.reportHeight()
  }

  disconnect() {
    window.removeEventListener("tab:loopchange", this.onLoopChange)
    window.removeEventListener("resize", this.onResize)
  }

  reportHeight() {
    document.documentElement.style.setProperty("--play-bar-height", `${this.element.offsetHeight}px`)
  }

  send(event) {
    window.dispatchEvent(new CustomEvent(`tab:${event.params.action}`))
  }
}
