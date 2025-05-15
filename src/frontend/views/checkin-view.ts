import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import './../elements/view/header.js'
import '@material/web/fab/fab.js'
import '@vandeurenglenn/lite-elements/icon.js'
import '@vandeurenglenn/flex-elements/row.js'

export class CheckinView extends LiteElement {
  @property({ type: Object, consumes: true }) accessor jobs

  #date

  #time

  beforeRender(): void {
    if (!this.#date) this.#date = new Date().toISOString().split('T')[0]
    if (!this.#time) this.#time = new Date().toISOString().split('T')[1].split(':').slice(0, 2).join(':')
  }

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
    `
  ]

  _handleFabKeyUp(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      this._addCheckin()
    }
  }

  _createJob() {
    this.dispatchEvent(
      new CustomEvent('create-job', {
        bubbles: true,
        composed: true,
        detail: {}
      })
    )
  }
  _addCheckin() {}

  render() {
    return html`
      <view-header
        title="Checkin"
        description="Checkin!"
        icon="fact_check"></view-header>

      <span class="date">
        <h3>date</h3>

        <input
          type="date"
          value=${this.#date} />
      </span>

      <span>
        <h3>from</h3>
        <input
          type="time"
          value=${this.#time} />
      </span>
      <span>
        <h3>till</h3>
        <input
          type="time"
          value=${this.#time} />
      </span>

      <chip-field
        label="jobs"
        customEvent
        multi
        @add-chip=${(event) => {
          this._createJob()
        }}
        .chips=${Object.entries(this.jobs || {}).map(([uuid, data]) => {
          return {
            label: data.name,
            value: uuid
          }
        })}></chip-field>

      <md-fab
        icon="add"
        @click=${() => this._addCheckin()}
        @keyup=${(event) => this._handleFabKeyUp(event)}>
        <custom-icon
          icon="add"
          slot="icon"></custom-icon
      ></md-fab>
    `
  }
}

customElements.define('checkin-view', CheckinView)
