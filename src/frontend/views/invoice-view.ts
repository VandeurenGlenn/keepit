import { LiteElement, html, css, property, query } from '@vandeurenglenn/lite'
import '@material/web/textfield/outlined-text-field.js'
import { Invoice, Job } from '../../types/index.js'
import '../elements/view/header.js'

function msToTime(ms) {
  let seconds = (ms / 1000).toFixed(1)
  let minutes = (ms / (1000 * 60)).toFixed(1)
  let hours = (ms / (1000 * 60 * 60)).toFixed(1)
  let days = (ms / (1000 * 60 * 60 * 24)).toFixed(1)
  if (seconds < 60) return seconds + ' s'
  else if (minutes < 60) return minutes + 'm'
  else if (hours < 24) return hours + ' h'
  else return days + ' Days'
}

export class InvoiceView extends LiteElement {
  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
      }
    `
  ]

  @property({ type: Object, consumes: true }) accessor invoice: Invoice

  render() {
    return html`
      ${this.invoice
        ? html`
            <view-header
              .title=${this.invoice.name}
              .description=${this.invoice.description || this.invoice.createdAt}
              icon="inventory2"></view-header>
            <md-outlined-text-field
              label="Job Name"
              value=${this.invoice.name}
              @input=${(event: Event) => {
                const input = event.target as HTMLInputElement
                this.invoice.name = input.value
              }}></md-outlined-text-field>
            <md-outlined-text-field
              label="Job Description"
              value=${this.invoice.description}
              @input=${(event: Event) => {
                const input = event.target as HTMLInputElement
                this.invoice.description = input.value
              }}></md-outlined-text-field>
          `
        : html`<loading-view></loading-view>`}
    `
  }
}

customElements.define('invoice-view', InvoiceView)
