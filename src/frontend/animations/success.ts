import { LiteElement, html, css, property } from '@vandeurenglenn/lite'

export class SuccessAnimation extends LiteElement {
  @property({ type: String }) accessor message
  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;

        font-size: 1.5em;
        color: #4caf50;
        animation: fadeIn 0.5s;
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
          stroke="#4caf50"
          stroke-width="4"
          fill="none" />
        <polyline
          points="25,45 38,58 58,32"
          fill="none"
          stroke="#4caf50"
          stroke-width="5"
          stroke-linecap="round"
          stroke-linejoin="round" />
      </svg>
      <div style="margin-top: 16px;">${this.message ?? 'success'}</div>
    `
  }
}
customElements.define('success-animation', SuccessAnimation)
