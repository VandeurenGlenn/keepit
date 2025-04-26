import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import './element.js'

export class ChipField extends LiteElement {
  @property({ type: Array }) accessor chips
  static styles = [
    css`
      :host {
        display: flex;
        flex-flow: row wrap;
        gap: 0.5rem;
        width: 100%;
        margin: 12px 0;
        width: 100%;
      }
    `
  ]

  async _addChip() {
    const label = prompt('Enter a new chip label:')
    if (!label) return;

    const response = await fetch('/api/chips', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ type: '', label })
    })

    if (response.status === 200) {
      this.chips = [...this.chips, label]
    }
  }

  render() {
    return html`
      ${this.chips?.map((label) => html`<chip-element .label=${label}></chip-element>`)}
      <custom-icon-button
        @click=${() => this._addChip()}
        icon="add"></custom-icon-button>
    `
  }
}
customElements.define('chip-field', ChipField)
