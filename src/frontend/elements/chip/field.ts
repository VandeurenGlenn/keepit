import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import './element.js'
import { ChipElement } from './element.js'

export class ChipField extends LiteElement {
  @property({ type: Array }) accessor chips
  @property({ type: Boolean }) accessor customEvent
  @property({ type: String }) accessor label
  @property({ type: Boolean, reflect: true }) accessor disabled
  @property({ type: Boolean, reflect: true }) accessor multi
  @property({ type: Array }) accessor selected = []

  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 10px;
        width: 100%;
        margin: 8px 0;
        pointer-events: none;
      }

      h4 {
        margin: 0;
        font-size: 0.8rem;
        font-weight: 500;
        letter-spacing: 0;
        color: var(--md-sys-color-on-surface-variant);
      }

      .row {
        display: flex;
        flex-flow: row wrap;
        gap: 0.5rem;
        width: 100%;
        padding: 10px;
        border-radius: var(--app-radius-control);
        border: 1px solid color-mix(in srgb, var(--app-border) 82%, transparent 18%);
        background: var(--app-panel);
        box-shadow: none;
        box-sizing: border-box;
        pointer-events: auto;
      }

      custom-icon-button {
        pointer-events: auto;
        margin-left: auto;
      }

      @media (max-width: 720px) {
        .row {
          padding: 10px;
          border-radius: var(--app-radius-control);
        }

        custom-icon-button {
          width: 100%;
          margin-left: 0;
        }
      }
    `
  ]

  async _addChip() {
    if (this.customEvent)
      return this.dispatchEvent(
        new CustomEvent('add-chip', {
          bubbles: true,
          composed: true
        })
      )

    const label = prompt('Enter a new chip label:')
    if (!label) return

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

  firstRender(): void {
    this.addListener('click', this._handleClick.bind(this))
    this.addListener('keydown', this._handleKeyDown.bind(this))
  }

  _handleChipSelected(e: Event) {
    const el = e.composedPath()[0] as ChipElement
    if (el.disabled) return

    if (this.multi) {
      if (!this.selected.includes(el.value)) {
        // If the chip is not selected, add it to the selected array
        // Otherwise, remove it from the selected array
        this.selected.push(el.value)
      } else {
        this.selected = this.selected.filter((v) => v !== el.value)
      }
      this.requestRender()
    } else {
      this.selected = [el.value]
    }

    this.dispatchEvent(new CustomEvent('chip-selected', { detail: this.selected }))
  }

  _handleClick(e: CustomEvent) {
    this._handleChipSelected(e)
  }
  _handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      this._handleChipSelected(e)
    }
  }

  render() {
    return html`
      ${this.label ? html`<h4>${this.label}</h4>` : ''}
      <span class="row">
        ${this.chips?.map(
          ({ label, value }) =>
            html`<chip-element
              ?selected=${this.selected?.includes(value)}
              .disabled=${this.disabled}
              .label=${label}
              .value=${value}></chip-element>`
        )}
        <custom-icon-button
          @click=${() => this._addChip()}
          icon="add"></custom-icon-button>
      </span>
    `
  }
}
customElements.define('chip-field', ChipField)
