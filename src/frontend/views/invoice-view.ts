import { LiteElement, html, css, property, query } from '@vandeurenglenn/lite'
import '@material/web/textfield/outlined-text-field.js'
import { Job } from '../../types/index.js'
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

  @property({ type: Object, consumes: true }) accessor job: Job

  render() {
    return html`
      ${this.job
        ? html` <view-header
              .title=${this.job.name}
              .description=${this.job.description || this.job.createdAt}
              icon="inventory2"></view-header>
            <md-outlined-text-field
              label="Job Name"
              value=${this.job.name}
              @input=${(event: Event) => {
                const input = event.target as HTMLInputElement
                this.job.name = input.value
              }}></md-outlined-text-field>
            <md-outlined-text-field
              label="Job Description"
              value=${this.job.description}
              @input=${(event: Event) => {
                const input = event.target as HTMLInputElement
                this.job.description = input.value
              }}></md-outlined-text-field>

            <h4>hours</h4>
            ${Object.entries(this.job.hours || {}).map(
              ([key, value]) => html`
                <span>
                  ${key}
                  <span>
                    ${Object.entries(value).map(
                      ([userId, user]) => html` <span> ${userId} ${msToTime(user.checkout - user.checkin)} </span> `
                    )}
                  </span>
                </span>
              `
            )}`
        : html`<loading-view></loading-view>`}
    `
  }
}

customElements.define('invoice-view', InvoiceView)
