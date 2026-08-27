import { LiteElement, html, css, property } from '@vandeurenglenn/lite'

export class ChipElement extends LiteElement {
  @property() accessor label
  @property({ type: String }) accessor value
  @property({ reflect: true, type: Boolean }) accessor disabled
  @property({ reflect: true, type: Boolean }) accessor selected
  @property() accessor leadingIcon
  @property() accessor trailingIcon

  static styles = [
    css`
      * {
        pointer-events: none;
      }
      :host {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 38px;
        padding: 0 12px;
        border-radius: 9px;
        font-size: 0.88rem;
        font-weight: 500;
        box-shadow: none;
        transition:
          background-color 0.3s,
          color 0.3s,
          border-color 0.18s ease,
          box-shadow 0.18s ease;
        cursor: pointer;
        user-select: none;
        text-decoration: none;
        text-align: center;
        width: fit-content;
        height: fit-content;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: normal;
        box-sizing: border-box;
        outline: none;
        border: 1px solid color-mix(in srgb, var(--app-border) 82%, transparent 18%);
        background: var(--app-panel);
        color: var(--md-sys-color-on-surface);
        pointer-events: auto;
        cursor: pointer;
      }

      :host(:hover) {
        background: var(--app-panel-strong);
        border-color: color-mix(in srgb, var(--app-accent) 34%, var(--app-border) 66%);
        box-shadow: none;
      }

      :host([hidden]) {
        display: none;
      }
      :host([disabled]) {
        pointer-events: none;
        opacity: 0.5;
      }
      :host([selected]) {
        background: var(--md-sys-color-primary-container);
        border-color: color-mix(in srgb, var(--app-accent) 28%, transparent 72%);
        color: var(--md-sys-color-on-primary-container);
      }
      :host([selected]):hover {
        color: var(--md-sys-color-on-primary-container);
      }
      :host([selected]):active {
        color: var(--md-sys-color-on-primary-container);
      }
      :host([disabled]) .chip {
        background-color: var(--md-sys-color-surface);
        color: var(--md-sys-color-on-surface);
      }
      :host([disabled]):hover {
        background-color: var(--md-sys-color-surface);
        color: var(--md-sys-color-on-surface);
      }
      :host([disabled]):active {
        background-color: var(--md-sys-color-surface);
        color: var(--md-sys-color-on-surface);
      }

      span {
        min-width: 0;
        word-break: break-word;
      }
    `
  ]

  onChange(propertyKey: string, value: any): void {
    if (propertyKey === 'selected') {
      this.ariaPressed = value
    }
    if (propertyKey === 'disabled') {
      this.ariaDisabled = value
    }
    if (propertyKey === 'label') {
      this.ariaLabel = value
    }
  }

  firstRender() {
    this.setAttribute('role', 'button')
    this.setAttribute('tabindex', '0')
  }

  render() {
    return html`
      ${this.leadingIcon ? html`<custom-icon icon="${this.leadingIcon}"></custom-icon>` : ''}
      <span>${this.label}</span>
      ${this.trailingIcon ? html`<custom-icon icon="${this.trailingIcon}"></custom-icon>` : ''}
    `
  }
}
customElements.define('chip-element', ChipElement)
