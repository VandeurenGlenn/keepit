import { css, html, LiteElement, property } from '@vandeurenglenn/lite'

export class ViewHeader extends LiteElement {
  @property({ type: String }) accessor title
  @property({ type: String }) accessor description
  @property({ type: String }) accessor icon
  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        padding: 16px;
        box-sizing: border-box;
        background-color: var(--md-sys-color-tertiary);
        color: var(--md-sys-color-on-tertiary);
        border-radius: var(--md-sys-shape-corner-small);
        --custom-icon-color: var(--md-sys-color-on-tertiary);
        --custom-icon-size: 110px;
        margin: 16px 0;
      }
    `
  ]
  render() {
    return html`
      <h1>${this.title}</h1>
      <p>${this.description}</p>
      <custom-icon
        .icon=${this.icon}
        size="large"></custom-icon>
    `
  }
}
customElements.define('view-header', ViewHeader)
