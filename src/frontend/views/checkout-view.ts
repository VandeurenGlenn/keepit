import { LiteElement, html, css, property, query } from '@vandeurenglenn/lite'
import './../elements/view/header.js'
import '@material/web/fab/fab.js'
import '@vandeurenglenn/lite-elements/icon.js'
import '@vandeurenglenn/flex-elements/row.js'
import { JobsMixin } from '../mixins/jobs.js'
import { api } from '../api/client.js'
import '../animations/success.js'
import { captureWorkLocation } from '../helpers/work-location.js'
import { User } from '../../types/index.js'
import { enqueueOfflineAction, flushOfflineActions, getOfflineActions, isNetworkFailure } from '../helpers/offline-actions.js'
import styles from './styles/checkout-view.css' with { type: 'css' }
export class CheckoutView extends JobsMixin(LiteElement) {
  @property({ type: Object, consumes: true }) accessor user: (Partial<User> & { id?: string }) | undefined = undefined
  @property({ type: Boolean }) accessor success = false
  @property({ type: Boolean }) accessor submitting = false
  @property({ type: String }) accessor error = ''
  @property({ type: Boolean }) accessor queued = false
  date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Brussels' }).format(new Date())

  time = new Date().toLocaleTimeString('nl-BE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Brussels',
    hour12: false
  })

  @query('input[type="date"]') accessor dateInput!: HTMLInputElement
  @query('input[type="time"]') accessor timeInput!: HTMLInputElement

  static styles = styles

  async _addCheckout() {
    const user = this.user
    if (!user?.id || this.submitting || this.success) return
    const job = user.currentJob
    if (!job) { this.error = 'Er is geen actieve werkregistratie om te stoppen.'; return }
    const prestationId = user.currentPrestationId
    const timestamp = new Date(`${this.dateInput.value}T${this.timeInput.value}`).getTime()
    if (!Number.isFinite(timestamp)) { this.error = 'Kies een geldige datum en tijd.'; return }
    const requestId = crypto.randomUUID()
    this.error = ''
    this.submitting = true
    try {
      const location = await captureWorkLocation()
      if (this.user?.id !== user.id) return
      const queue = () => {
        enqueueOfflineAction({ type: 'checkout', job, timestamp, location, prestationId }, requestId)
        this.queued = true
      }
      if (!navigator.onLine || getOfflineActions().length || prestationId?.startsWith('pending:')) {
        queue()
      } else {
        try {
          await api.checkOut(job, timestamp, location, {
            prestationId,
            clientRequestId: requestId
          })
        } catch (error) {
          if (this.user?.id !== user.id || !isNetworkFailure(error)) throw error
          queue()
        }
      }
      if (this.user?.id !== user.id) return
      this.user.currentJob = undefined
      this.user.currentPrestationId = undefined
      this.success = true
      if (this.queued) void flushOfflineActions()
      setTimeout(() => {
        if (this.isConnected) window.location.hash = '#!/home'
      }, this.queued ? 1500 : 1200)
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Check-out mislukt'
    } finally {
      this.submitting = false
    }
  }

  render() {
    if (this.success) {
      return html` <success-animation
        message=${this.queued
          ? 'Offline bewaard · synchroniseert zodra internet terug is'
          : 'Je werkdag is afgerond'}></success-animation>`
    }
    if (!this.user?.currentJob) {
      return html`<error-animation
        message="Er loopt momenteel geen werkregistratie."
        .action=${{ label: 'Werk starten', href: '#!/checkin' }}></error-animation>`
    }
    const activeJob = this.jobs?.[this.user.currentJob]
    return html`
      <view-header
        title="Checkout"
        description="Rond je actieve werksessie af."
        icon="arrow_upward"></view-header>

      <section class="form-panel">
        <h2 class="form-heading">Werkdag afronden</h2>
        <p class="form-description">Controleer het eindmoment. Alleen onderstaande actieve sessie wordt afgesloten.</p>

        <section
          class="active-job"
          aria-label="Actieve job">
          <span class="active-job-icon"><custom-icon icon="work"></custom-icon></span>
          <div>
            <strong>${activeJob?.name || 'Actieve job'}</strong>
            <span>${activeJob?.place?.formattedAddress || 'Handmatig gestarte werkregistratie'}</span>
          </div>
        </section>

        <label class="field"
          >Datum<span
            class="field-shell"
            @click=${() => this.dateInput.showPicker()}>
            <input
              type="date"
              required
              value=${this.date} /> </span
        ></label>

        <label class="field"
          >Eindtijd<span
            class="field-shell"
            @click=${() => this.timeInput.showPicker()}>
            <input
              type="time"
              required
              value=${this.time} /> </span
        ></label>

        ${this.error ? html`<p class="error">${this.error}</p>` : ''}
        <button
          class="primary"
          ?disabled=${this.submitting}
          @click=${() => this._addCheckout()}>
          ${this.submitting ? 'Bezig met stoppen…' : 'Stop deze job'}
        </button>
      </section>
    `
  }
}

customElements.define('checkout-view', CheckoutView)
