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
import { enqueueOfflineAction, isNetworkFailure } from '../helpers/offline-actions.js'

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

      .field{display:flex;flex-direction:column;gap:7px;color:var(--md-sys-color-on-surface-variant);font-size:.75rem;font-weight:700}.field select{width:100%;height:48px;padding:0 12px;border:1px solid var(--app-border);border-radius:var(--app-radius-control);background:var(--app-panel-strong);color:var(--md-sys-color-on-surface);font:inherit}

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
        font-weight: 600;
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

  async _addCheckin() {
    if (!this.user?.id) {
      console.error('Missing user id for checkin')
      return
    }

    const date = this.dateInput.value
    const time = this.timeInput.value
    const checkin = new Date(`${date}T${time}`).getTime()

    this.select.checkValidity() // Ensure the select is valid
    if (!this.select.reportValidity()) {
      console.error('Select is not valid')
      return
    }
    this.error = ''
    this.submitting = true
    try {
      const workLocation = await captureWorkLocation()
      const requestId=crypto.randomUUID()
      const prestation = await api.checkIn(this.select.value, checkin, workLocation, {
        source: 'manual',
        clientRequestId: requestId
      })
      this.user.currentJob = this.select.value
      this.user.currentPrestationId = prestation.id
      this.success = true
      setTimeout(() => {
        location.href = '#!/home'
      }, 1200)
    } catch (error) {
      if(isNetworkFailure(error)){
        const requestId=enqueueOfflineAction({type:'checkin',job:this.select.value,timestamp:checkin,location:await captureWorkLocation()})
        this.user.currentJob=this.select.value;this.user.currentPrestationId=`pending:${requestId}`;this.queued=true;this.success=true
        setTimeout(()=>{location.href='#!/home'},1500);return
      }
      console.error('Checkin failed:', error)
      this.error = error instanceof Error ? error.message : 'Check-in mislukt'
    } finally {
      this.submitting = false
    }
  }

  render() {
    if (this.success) {
      return html` <success-animation message=${this.queued?'Offline bewaard · synchroniseert zodra internet terug is':'Je werkdag is gestart'}></success-animation>`
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

        <label class="field">Datum
          <span class="field-shell" @click=${() => this.dateInput.showPicker()}>
          <input
            type="date"
            required
            value=${this.date} />
          </span></label>

        <label class="field">Starttijd
          <span class="field-shell" @click=${() => this.timeInput.showPicker()}>
          <input
            type="time"
            required
            value=${this.time} />
          </span></label>

        <label class="field">Job<select .value=${new URLSearchParams(location.hash.split('?')[1] || '').get('job') || ''} required><option value="" disabled>Kies een job</option>
          ${(Object.entries(this.jobs || {}) as Array<[string, any]>).filter(([, data]) => data.status !== 'completed' && !data.archivedAt).map(
            ([uuid, data]) => html`<option value=${uuid}>${data.name}</option>`
          )}
        </select></label>

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
