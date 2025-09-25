import { css, html, LiteElement } from '@vandeurenglenn/lite'

// @build
export class BuildInfo extends LiteElement {
  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        font-size: 0.8em;
        color: var(--md-sys-color-on-surface-variant);
        margin: 16px;
      }
      span {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 8px;
        justify-content: space-between;
      }
      small {
        color: var(--md-sys-color-on-surface-variant);
      }
    `
  ]

  render() {
    return html` <span
      >version: ${globalThis.__keepit__.build.version}
      <small>build: ${globalThis.__keepit__.build.current} </small></span
    >`
  }
}
customElements.define('build-info', BuildInfo)
