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
    const newChip = prompt('Enter a new chip label:')
    if (newChip) {
      this.chips = [...this.chips, newChip]
    }
    await fetch('/api/chips', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ type: '', label: newChip })
    })
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
