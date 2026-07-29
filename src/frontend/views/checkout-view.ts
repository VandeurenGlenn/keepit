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
import '@material/web/select/outlined-select.js'
import '@material/web/select/select-option.js'
import { MdOutlinedSelect } from '@material/web/select/outlined-select.js'
import { captureWorkLocation } from '../helpers/work-location.js'
import { User } from '../../types/index.js'

export class CheckoutView extends JobsMixin(LiteElement) {
  @property({ type: Object, consumes: true }) accessor user: (Partial<User> & { id?: string }) | undefined = undefined
  @property({ type: Boolean }) accessor success = false
  @property({ type: Boolean }) accessor submitting = false
  @property({ type: String }) accessor error = ''
  date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Brussels' }).format(new Date())

  time = new Date().toLocaleTimeString('nl-BE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Brussels',
    hour12: false
  })

  @query('input[type="date"]') accessor dateInput!: HTMLInputElement
  @query('input[type="time"]') accessor timeInput!: HTMLInputElement
  @query('md-outlined-select') accessor select!: MdOutlinedSelect

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
        border-radius: 20px;
        background: var(--app-panel);
        border: 1px solid var(--app-border);
        box-shadow: var(--app-shadow-soft);
        box-sizing: border-box;
      }

      md-outlined-select {
        width: 100%;
      }

      .field-shell {
        display: flex;
        align-items: center;
        padding: 10px 14px;
        width: 100%;
        justify-content: space-between;
        box-sizing: border-box;
        border-radius: 13px;
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
        border-radius: 12px;
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
          border-radius: 20px;
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

    this.select.checkValidity() // Ensure the select is valid
    if (!this.select.reportValidity()) {
      console.error('Select is not valid')
      return
    }
    this.error = ''
    this.submitting = true
    try {
      const workLocation = await captureWorkLocation()
      await api.checkOut(this.select.value, checkout, workLocation)
      this.user.currentJob = undefined
      this.success = true
      setTimeout(() => {
        location.href = '#!/home'
      }, 1200)
    } catch (error) {
      console.error('Checkout failed:', error)
      this.error = error instanceof Error ? error.message : 'Checkout mislukt'
    } finally {
      this.submitting = false
    }
  }

  render() {
    if (this.success) {
      return html` <success-animation message="Je werkdag is afgerond"></success-animation>`
    }
    return html`
      <view-header
        title="Checkout"
        description="Rond je actieve werksessie af."
        icon="arrow_upward"></view-header>

      <section class="form-panel">
        <h2 class="form-heading">Werkdag afronden</h2>
        <p class="form-description">Kies het uitcheckmoment en bevestig de job die je sessie afsluit.</p>

        <span
          class="field-shell"
          @click=${() => this.dateInput.showPicker()}>
          <h3>Datum</h3>

          <input
            type="date"
            required
            value=${this.date} />
        </span>

        <span
          class="field-shell"
          @click=${() => this.timeInput.showPicker()}>
          <h3>Tijd</h3>
          <input
            type="time"
            required
            value=${this.time} />
        </span>

        <md-outlined-select
          label="Job"
          .value=${this.user?.currentJob || ''}
          required>
          ${(Object.entries(this.jobs || {}) as Array<[string, any]>).map(
            ([uuid, data]) => html`
              <md-select-option
                .value=${uuid}
                ?selected=${this.select?.value === uuid}>
                ${data.name}
              </md-select-option>
            `
          )}
        </md-outlined-select>

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
