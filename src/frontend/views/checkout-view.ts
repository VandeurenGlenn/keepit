import { LiteElement, html, css, property, query } from '@vandeurenglenn/lite'
import './../elements/view/header.js'
import '@material/web/fab/fab.js'
import '@vandeurenglenn/lite-elements/icon.js'
import '@vandeurenglenn/flex-elements/row.js'
import { ChipField } from '../elements/chip/field.js'
import './../elements/chip/field.js'
import { JobsMixin } from '../mixins/jobs.js'

export class CheckoutView extends JobsMixin(LiteElement) {
  @property({ type: Object, consumes: true }) accessor user
  @property({ type: Boolean }) accessor success = false
  date = new Date().toISOString().split('T')[0]

  time = new Date().toLocaleTimeString('nl-BE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Europe/Brussels',
    hour12: false
  })

  @query('input[type="date"]') accessor dateInput: HTMLInputElement
  @query('input[type="time"]') accessor timeInput: HTMLInputElement
  @query('chip-field') accessor chipField: ChipField

  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        align-items: center;
        height: 100%;
        width: 100%;
      }
      md-fab {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 1000;
      }

      span {
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
      }
      .success-animation {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        font-size: 1.5em;
        color: #4caf50;
        animation: fadeIn 0.5s;
      }
      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
    `
  ]

  async _addCheckout() {
    const date = this.dateInput.value // e.g. "2025-05-20"
    const time = this.timeInput.value // e.g. "14:30"
    // Combine date and time
    const checkout = new Date(`${date}T${time}`).getTime()

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
        job: this.chipField.selected[0]
      })
    })
    if (response.status === 200) {
      this.success = true // <-- Show animation
      setTimeout(() => {
        location.href = '#!/home'
      }, 1200) // 1.2s for animation
    } else {
      console.error('Error adding Checkout', response)
    }
  }

  render() {
    if (this.success) {
      return html`
        <div class="success-animation">
          <svg
            width="80"
            height="80"
            viewBox="0 0 80 80">
            <circle
              cx="40"
              cy="40"
              r="38"
              stroke="#4caf50"
              stroke-width="4"
              fill="none" />
            <polyline
              points="25,45 38,58 58,32"
              fill="none"
              stroke="#4caf50"
              stroke-width="5"
              stroke-linecap="round"
              stroke-linejoin="round" />
          </svg>
          <div style="margin-top: 16px;">Check-out succesvol!</div>
        </div>
      `
    }
    return html`
      <view-header
        title="Checkout"
        description="Checkout!"
        icon="arrow_downward"></view-header>

      <span class="date">
        <h3>date</h3>

        <input
          type="date"
          value=${this.date} />
      </span>

      <span>
        <h3>time</h3>
        <input
          type="time"
          value=${this.time} />
      </span>

      <chip-field
        label="jobs"
        customEvent
        @add-chip=${(event) => {
          this._createJob()
        }}
        .chips=${Object.entries(this.jobs || {}).map(([uuid, data]) => {
          return {
            label: data.name,
            value: uuid
          }
        })}></chip-field>

      <md-fab @click=${() => this._addCheckout()}>
        <custom-icon
          icon="save"
          slot="icon"></custom-icon
      ></md-fab>
    `
  }
}

customElements.define('checkout-view', CheckoutView)
