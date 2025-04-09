import { LiteElement, html, css, property } from '@vandeurenglenn/lite'

export class ChipElement extends LiteElement {
  @property() accessor label
  @property({ reflect: true, type: Boolean }) accessor disabled
  @property({ reflect: true, type: Boolean }) accessor selected
  @property() accessor leadingIcon
  @property() accessor trailingIcon

  static styles = [
    css`
      :host {
        display: flex;
        align-items: center;
        padding: 0.5rem 1rem;
        border-radius: 16px;
        font-size: 1rem;
        font-weight: 500;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        transition: background-color 0.3s, color 0.3s;
        cursor: pointer;
        user-select: none;
        text-decoration: none;
        text-align: center;
        width: fit-content;
        height: fit-content;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        box-sizing: border-box;
        outline: none;
        border: 1px solid var(--md-sys-color-outline);
        border-radius: var(--md-sys-shape-corner-small);
        background-color: var(--md-sys-color-surface-container);
        color: var(--md-sys-color-on-surface-container);
      }
      :host([hidden]) {
        display: none;
      }
      :host([disabled]) {
        pointer-events: none;
        opacity: 0.5;
      }
      :host([selected]) {
        background-color: var(--md-sys-color-tertiary);
        color: var(--md-sys-color-on-tertiary);
      }
      :host([selected]):hover {
        background-color: var(--md-sys-color-tertiary-container);
        color: var(--md-sys-color-on-tertiary-container);
      }
      :host([selected]):active {
        background-color: var(--md-sys-color-tertiary);
        color: var(--md-sys-color-on-tertiary);
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
    this.addEventListener('click', this._handleClick.bind(this))
    this.addEventListener('keydown', this._handleKeyDown.bind(this))
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
  _handleClick() {
    if (this.disabled) return
    this.selected = !this.selected
    this.dispatchEvent(new CustomEvent('chip-selected', { detail: this.selected }))
  }
  _handleKeyDown(e) {
    if (this.disabled) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      this._handleClick()
    }
  }
}
customElements.define('chip-element', ChipElement)
