import { LiteElement, html, css, property, query } from '@vandeurenglenn/lite'
import './../elements/view/header.js'
import '@material/web/fab/fab.js'
import '@vandeurenglenn/lite-elements/icon.js'
import '@vandeurenglenn/flex-elements/row.js'
import { ChipField } from '../elements/chip/field.js'
import './../elements/chip/field.js'
import { JobsMixin } from '../mixins/jobs.js'
import '../animations/success.js'
import '@material/web/select/outlined-select.js'
import '@material/web/select/select-option.js'
import { MdOutlinedSelect } from '@material/web/select/outlined-select.js'

export class CheckoutView extends JobsMixin(LiteElement) {
  @property({ type: Object, consumes: true }) accessor user
  @property({ type: Boolean }) accessor success = false
  date = new Date().toISOString().split('T')[0]

  time = new Date().toLocaleTimeString('nl-BE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Brussels',
    hour12: false
  })

  @query('input[type="date"]') accessor dateInput: HTMLInputElement
  @query('input[type="time"]') accessor timeInput: HTMLInputElement
  @query('md-outlined-select') accessor select: MdOutlinedSelect

  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        max-width: 760px;
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
        border-radius: 24px;
        background: linear-gradient(180deg, color-mix(in srgb, var(--app-panel) 96%, white 4%), var(--app-panel));
        border: 1px solid var(--app-border);
        box-shadow: var(--app-shadow-strong);
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
        border-radius: 18px;
        box-shadow: var(--app-shadow-soft);
        border: 1px solid color-mix(in srgb, var(--app-border) 84%, transparent 16%);
        background: color-mix(in srgb, var(--app-panel-strong) 95%, white 5%);
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
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--app-accent) 88%, white 12%),
          var(--app-accent-strong)
        );
        color: var(--md-sys-color-on-primary);
        border-radius: 999px;
        padding: 12px 18px;
        font: inherit;
        cursor: pointer;
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
    const date = this.dateInput.value // e.g. "2025-05-20"
    const time = this.timeInput.value // e.g. "14:30"
    // Combine date and time
    const checkout = new Date(`${date}T${time}`).getTime()

    this.select.checkValidity() // Ensure the select is valid
    if (!this.select.reportValidity()) {
      console.error('Select is not valid')
      return
    }
    this.select.reportValidity()
    console.log(this.user)
    const response = await fetch('/api/hours/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: localStorage.getItem('token')
      },

      body: JSON.stringify({
        checkout,
        userId: this.user.id,
        date: this.dateInput.value,
        job: this.select.value
      })
    })
    if (response.status === 200) {
      this.success = true // <-- Show animation
      setTimeout(() => {
        location.href = '#!/home'
      }, 1200) // 1.2s for animation
    } else {
      console.error('Error adding checkout', response)
    }
  }

  render() {
    if (this.success) {
      return html` <success-animation message="Checked-out successfully!"></success-animation>`
    }
    return html`
      <view-header
        title="Checkout"
        description="Checkout!"
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
          .value=${this.user?.currentJob}
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

        <button
          class="primary"
          @click=${() => this._addCheckout()}>
          Bewaar checkout
        </button>
      </section>
    `
  }
}

customElements.define('checkout-view', CheckoutView)
