import { html, css, LiteElement, property } from '@vandeurenglenn/lite'

import '@vandeurenglenn/lite-elements/icon-button.js'
export class ActionItem extends LiteElement {
  @property({ type: String }) accessor action
  @property({ type: String }) accessor icon
  @property({ type: Boolean, attribute: 'in-dropdown' }) accessor inDropdown

  render() {
    return html`
        <custom-icon-button
          .icon=${this.icon ? this.icon : this.action}
          > </custom-icon-button>
        ${this.inDropdown ? html`<span>${this.action ? this.action : this.icon}</span>` : ''}
      </div>
    `
  }

  static styles = [
    css`
      :host {
        display: flex;
        align-items: center;
        cursor: pointer;
        color: var(--md-sys-color-on-surface);
      }
      :host([in-dropdown]) {
        width: 100%;
      }
    `
  ]
}
customElements.define('action-item', ActionItem)
