import { LiteElement, html, css, property, query } from '@vandeurenglenn/lite'
import './../elements/view/header.js'
import '@material/web/fab/fab.js'
import '@vandeurenglenn/lite-elements/icon.js'
import '@vandeurenglenn/flex-elements/row.js'
import { ChipField } from '../elements/chip/field.js'
import './../elements/chip/field.js'
import { JobsMixin } from '../mixins/jobs.js'
import { api } from '../api/client.js'
import '../animations/success.js'
import '../animations/error.js'
import { captureWorkLocation } from '../helpers/work-location.js'
import { enqueueOfflineAction, flushOfflineActions, getOfflineActions, isNetworkFailure } from '../helpers/offline-actions.js'
import styles from './styles/checkin-view.css' with { type: 'css' }

export class CheckinView extends JobsMixin(LiteElement) {
  @property({ type: Object, consumes: true }) accessor user
  @property({ type: Boolean }) accessor success = false
  @property({ type: String }) accessor error
  @property({ type: Array }) accessor steps
  @property({ type: String }) accessor currentJob
  @property({ type: Boolean }) accessor submitting = false
  @property({ type: Boolean }) accessor queued = false

  date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Brussels' }).format(new Date())

  time = new Date().toLocaleTimeString('nl-BE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Brussels',
    hour12: false
  })

  @query('input[type="date"]') accessor dateInput: HTMLInputElement
  @query('input[type="time"]') accessor timeInput: HTMLInputElement
  @query('select') accessor select: HTMLSelectElement

  static styles = styles

  async _addCheckin() {
    const user = this.user
    if (!user?.id || this.submitting || this.success) return
    const job = this.select.value
    if (!this.select.reportValidity()) return
    const timestamp = new Date(`${this.dateInput.value}T${this.timeInput.value}`).getTime()
    if (!Number.isFinite(timestamp)) { this.error = 'Kies een geldige datum en tijd.'; return }
    const requestId = crypto.randomUUID()
    this.error = ''
    this.submitting = true
    try {
      const location = await captureWorkLocation()
      if (this.user?.id !== user.id) return
      const queue = () => {
        enqueueOfflineAction({ type: 'checkin', job, timestamp, location }, requestId)
        this.queued = true
      }
      let savedId: string | undefined
      if (!navigator.onLine || getOfflineActions().length) {
        queue()
      } else {
        try {
          const saved = await api.checkIn(job, timestamp, location, {
            source: 'manual',
            clientRequestId: requestId
          })
          savedId = saved.id
        } catch (error) {
          if (this.user?.id !== user.id || !isNetworkFailure(error)) throw error
          queue()
        }
      }
      if (this.user?.id !== user.id) return
      this.user.currentJob = job
      this.user.currentPrestationId = savedId || `pending:${requestId}`
      this.success = true
      if (this.queued) void flushOfflineActions()
      setTimeout(() => {
        if (this.isConnected) window.location.hash = '#!/home'
      }, this.queued ? 1500 : 1200)
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Check-in mislukt'
    } finally {
      this.submitting = false
    }
  }

  render() {
    if (this.success) {
      return html` <success-animation
        message=${this.queued
          ? 'Offline bewaard · synchroniseert zodra internet terug is'
          : 'Je werkdag is gestart'}></success-animation>`
    }
    if (this.user?.currentJob) {
      return html`
        <error-animation
          message="Je bent nog ingecheckt op een andere job."
          .action=${{ label: 'Ga naar checkout', href: `#!/checkout?job=${this.user.currentJob}` }}></error-animation>
      `
    }
    return html`
      <view-header
        title="Check-in"
        description="Start je werkdag op de juiste job."
        icon="arrow_downward"></view-header>

      <section class="form-panel">
        <h2 class="form-heading">Werkdag starten</h2>
        <p class="form-description">
          Kies datum, tijd en job. De check-in wordt meteen gekoppeld aan je huidige sessie.
        </p>

        <label class="field"
          >Datum
          <span
            class="field-shell"
            @click=${() => this.dateInput.showPicker()}>
            <input
              type="date"
              required
              value=${this.date} /> </span
        ></label>

        <label class="field"
          >Starttijd
          <span
            class="field-shell"
            @click=${() => this.timeInput.showPicker()}>
            <input
              type="time"
              required
              value=${this.time} /> </span
        ></label>

        <label class="field"
          >Job<select
            .value=${new URLSearchParams(location.hash.split('?')[1] || '').get('job') || ''}
            required>
            <option
              value=""
              disabled>
              Kies een job
            </option>
            ${(Object.entries(this.jobs || {}) as Array<[string, any]>)
              .filter(([, data]) => data.status !== 'completed' && !data.archivedAt)
              .map(([uuid, data]) => html`<option value=${uuid}>${data.name}</option>`)}
          </select></label
        >

        ${this.error ? html`<p class="error">${this.error}</p>` : ''}
        <button
          class="primary"
          ?disabled=${this.submitting}
          @click=${() => this._addCheckin()}>
          ${this.submitting ? 'Bezig met starten…' : 'Start deze job'}
        </button>
      </section>
    `
  }
}

customElements.define('checkin-view', CheckinView)
