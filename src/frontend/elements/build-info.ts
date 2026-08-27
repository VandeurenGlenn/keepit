import { css, html, LiteElement } from '@vandeurenglenn/lite'

// @build
export class BuildInfo extends LiteElement {
  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        font-size: 1em;
        color: var(--md-sys-color-on-surface-variant);
        margin: 0;
      }
      span {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 6px;
        justify-content: space-between;
        white-space: nowrap;
      }
      small {
        color: var(--md-sys-color-on-surface-variant);
        font-size: inherit;
        opacity: 0.72;
      }
    `
  ]

  render() {
    return html` <span
      >Versie ${globalThis.__keepit__.build.version} <small>Build ${globalThis.__keepit__.build.current}</small></span
    >`
  }
}
customElements.define('build-info', BuildInfo)
