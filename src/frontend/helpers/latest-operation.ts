/** A new user action invalidates every result belonging to the previous action. */
export class LatestOperation {
  private controller?: AbortController

  begin(): AbortSignal {
    this.cancel()
    this.controller = new AbortController()
    return this.controller.signal
  }

  cancel() {
    this.controller?.abort()
    this.controller = undefined
  }
}
