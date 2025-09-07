import { LiteElement, html, css, property } from '@vandeurenglenn/lite'

export class ErrorAnimation extends LiteElement {
  @property({ type: String }) accessor message
  @property({ type: String }) accessor currentJob
  @property({ type: Object }) accessor action: { label: string; href: string }
  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;

        font-size: 1.5em;
        color: #f44336;
        animation: fadeIn 0.5s;
      }

      a {
        color: inherit;
        text-decoration: none;
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
    `
  ]
  render() {
    return html`
      <svg
        width="80"
        height="80"
        viewBox="0 0 80 80">
        <circle
          cx="40"
          cy="40"
          r="38"
          stroke="#f44336"
          stroke-width="4"
          fill="none" />
        <line
          x1="28"
          y1="28"
          x2="52"
          y2="52"
          stroke="#f44336"
          stroke-width="6"
          stroke-linecap="round" />
        <line
          x1="52"
          y1="28"
          x2="28"
          y2="52"
          stroke="#f44336"
          stroke-width="6"
          stroke-linecap="round" />
      </svg>
      ${this.message ? html`<div style="margin-top: 16px;">${this.message ?? 'error'}</div>` : ''}
      ${this.action
        ? html`<div style="margin-top: 16px;">
            <a
              href=${this.action.href}
              @click=${(e) => (document.querySelector('app-shell').error = undefined)}
              ><custom-button label=${this.action.label}></custom-button
            ></a>
          </div>`
        : ''}
      ${this.currentJob
        ? html`<div style="margin-top: 16px;">
            <a href="#!/checkout?job=${this.currentJob}"><custom-button label="click to checkout"></custom-button></a>
          </div>`
        : ''}
    `
  }
}
customElements.define('error-animation', ErrorAnimation)
