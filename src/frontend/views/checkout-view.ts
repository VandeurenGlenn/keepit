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
import { enqueueOfflineAction, isNetworkFailure } from '../helpers/offline-actions.js'

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

  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        max-width: 820px;
        width: 100%;
        padding: 16px;
        box-sizing: border-box;
        gap: 18px;
      }

      .form-panel {
        display: flex;
        flex-direction: column;
        gap: 16px;
        width: 100%;
        padding: 18px;
        border-radius: var(--app-radius-panel);
        background: var(--app-panel);
        border: 1px solid var(--app-border);
        box-shadow: var(--app-shadow-soft);
        box-sizing: border-box;
      }

      .field{display:flex;flex-direction:column;gap:7px;color:var(--md-sys-color-on-surface-variant);font-size:.75rem;font-weight:700}

      .field-shell {
        display: flex;
        align-items: center;
        padding: 10px 14px;
        width: 100%;
        justify-content: space-between;
        box-sizing: border-box;
        border-radius: var(--app-radius-control);
        border: 1px solid color-mix(in srgb, var(--app-border) 84%, transparent 16%);
        background: var(--app-panel-strong);
        cursor: pointer;
      }

      .field-shell h3,
      .form-heading,
      .form-description {
        margin: 0;
      }

      .form-heading {
        font-size: 1.3rem;
      }

      .form-description {
        color: var(--md-sys-color-on-surface-variant);
        line-height: 1.5;
      }

      input[type='date'],
      input[type='time'] {
        padding: 12px;
        box-sizing: border-box;
        background: transparent;
        border: none;
        color: var(--md-sys-color-on-background);
        outline: none;
      }
      ::-webkit-calendar-picker-indicator {
        filter: invert(1);
      }

      ::-webkit-calendar-picker {
        color: var(--md-sys-color-on-background);
        background-color: var(--md-sys-color-surface);
      }

      button.primary {
        border: 1px solid color-mix(in srgb, var(--app-accent) 82%, white 18%);
        background: var(--app-accent);
        color: var(--md-sys-color-on-primary);
        border-radius: var(--app-radius-control);
        padding: 12px 18px;
        font: inherit;
        cursor: pointer;
      }

      button.primary[disabled] {
        opacity: 0.62;
        cursor: wait;
      }

      .error {
        margin: 0;
        color: var(--md-sys-color-error);
        font-weight: 650;
      }

      .active-job {
        display: grid;
        grid-template-columns: 42px minmax(0, 1fr);
        align-items: center;
        gap: 12px;
        padding: 14px;
        border: 1px solid color-mix(in srgb, var(--app-accent) 42%, var(--app-border));
        border-radius: var(--app-radius-control);
        background: var(--app-accent-soft);
      }

      .active-job-icon {
        display: grid;
        width: 42px;
        height: 42px;
        place-items: center;
        border-radius: 10px;
        background: var(--app-accent);
        color: var(--md-sys-color-on-primary);
      }

      .active-job strong,
      .active-job span { display: block; }
      .active-job span {
        margin-top: 3px;
        overflow: hidden;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.78rem;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      @media (max-width: 720px) {
        :host {
          padding: 12px;
        }

        .form-panel {
          padding: 16px;
          border-radius: var(--app-radius-panel);
        }

        .field-shell {
          flex-direction: column;
          align-items: flex-start;
          gap: 8px;
        }

        button.primary {
          width: 100%;
        }
      }
    `
  ]

  async _addCheckout() {
    if (!this.user?.id) {
      console.error('Missing user id for checkout')
      return
    }

    const date = this.dateInput.value
    const time = this.timeInput.value
    const checkout = new Date(`${date}T${time}`).getTime()

    const activeJobId = this.user.currentJob
    if (!activeJobId) {
      this.error = 'Er is geen actieve werkregistratie om te stoppen.'
      return
    }
    this.error = ''
    this.submitting = true
    try {
      const workLocation = await captureWorkLocation()
      await api.checkOut(activeJobId, checkout, workLocation, {
        prestationId: this.user.currentPrestationId,
        clientRequestId: crypto.randomUUID()
      })
      this.user.currentJob = undefined
      this.user.currentPrestationId = undefined
      this.success = true
      setTimeout(() => {
        location.href = '#!/home'
      }, 1200)
    } catch (error) {
      if(isNetworkFailure(error)){
        enqueueOfflineAction({type:'checkout',job:activeJobId,timestamp:checkout,location:await captureWorkLocation(),prestationId:this.user.currentPrestationId})
        this.user.currentJob=undefined;this.user.currentPrestationId=undefined;this.queued=true;this.success=true
        setTimeout(()=>{location.href='#!/home'},1500);return
      }
      console.error('Checkout failed:', error)
      this.error = error instanceof Error ? error.message : 'Checkout mislukt'
    } finally {
      this.submitting = false
    }
  }

  render() {
    if (this.success) {
      return html` <success-animation message=${this.queued?'Offline bewaard · synchroniseert zodra internet terug is':'Je werkdag is afgerond'}></success-animation>`
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

        <section class="active-job" aria-label="Actieve job">
          <span class="active-job-icon"><custom-icon icon="work"></custom-icon></span>
          <div>
            <strong>${activeJob?.name || 'Actieve job'}</strong>
            <span>${activeJob?.place?.formattedAddress || 'Handmatig gestarte werkregistratie'}</span>
          </div>
        </section>

        <label class="field">Datum<span class="field-shell" @click=${() => this.dateInput.showPicker()}>
          <input
            type="date"
            required
            value=${this.date} />
        </span></label>

        <label class="field">Eindtijd<span class="field-shell" @click=${() => this.timeInput.showPicker()}>
          <input
            type="time"
            required
            value=${this.time} />
        </span></label>

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
