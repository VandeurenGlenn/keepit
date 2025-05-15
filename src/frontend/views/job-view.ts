import { LiteElement, html, css, property, query } from '@vandeurenglenn/lite'
import '@material/web/textfield/outlined-text-field.js'
import { Job } from '../../types/index.js'
import './../elements/view/header.js'

export class JobView extends LiteElement {
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
              }}></md-outlined-text-field>`
        : html`<loading-view></loading-view>`}
    `
  }
}

customElements.define('job-view', JobView)
