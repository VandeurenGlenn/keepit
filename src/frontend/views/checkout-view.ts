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
        align-items: center;
        height: 100%;
        max-width: 720px;
        width: 100%;
      }
      md-fab {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 1000;
      }

      md-outlined-select {
        width: 100%;
        margin: 16px 0;
      }

      span {
        margin: 16px 0;
        display: flex;
        align-items: center;
        padding: 6px 12px;
        margin-bottom: 6px;
        width: 100%;
        justify-content: space-between;
        box-sizing: border-box;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        border: 1px solid var(--md-sys-color-outline);
        border-radius: var(--md-sys-shape-corner-small);
        cursor: pointer;
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

      <span @click=${() => this.dateInput.showPicker()}>
        <h3>date</h3>

        <input
          type="date"
          required
          value=${this.date} />
      </span>

      <span @click=${() => this.timeInput.showPicker()}>
        <h3>time</h3>
        <input
          type="time"
          required
          value=${this.time} />
      </span>

      <md-outlined-select
        label="Job"
        .value=${this.user?.currentJob}
        required>
        ${Object.entries(this.jobs || {}).map(
          ([uuid, data]) => html`
            <md-select-option
              .value=${uuid}
              ?selected=${this.select?.value === uuid}>
              ${data.name}
            </md-select-option>
          `
        )}
      </md-outlined-select>

      <md-fab @click=${() => this._addCheckout()}>
        <custom-icon
          icon="save"
          slot="icon"></custom-icon
      ></md-fab>
    `
  }
}

customElements.define('checkout-view', CheckoutView)
